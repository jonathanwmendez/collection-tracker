import "server-only";
import { googleFetch } from "./google";
import { cellRange, readHeaders, type CellWrite, type Headers } from "./sheet-format";

const BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const sheetsFetch = (token: string, url: string, init: RequestInit = {}) => googleFetch(token, url, init, "Google Sheets");

const quote = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

export type Tab = { headers: Headers; rows: unknown[][] };

/** Tab title to its numeric sheet ID (the gid in links), plus the spreadsheet's title. */
export async function getTabs(token: string, sheetId: string): Promise<{ title: string; tabs: Record<string, number> }> {
  const res = await sheetsFetch(
    token,
    `${BASE}/${encodeURIComponent(sheetId)}?fields=properties.title,sheets.properties(sheetId,title)`,
  );
  const json = (await res.json()) as {
    properties?: { title?: string };
    sheets?: Array<{ properties: { sheetId: number; title: string } }>;
  };
  const tabs: Record<string, number> = {};
  for (const s of json.sheets ?? []) tabs[s.properties.title] = s.properties.sheetId;
  return { title: json.properties?.title ?? "", tabs };
}

async function batchGet(token: string, sheetId: string, ranges: string[], render: "FORMULA" | "FORMATTED_VALUE") {
  const params = new URLSearchParams({ valueRenderOption: render, dateTimeRenderOption: "SERIAL_NUMBER", majorDimension: "ROWS" });
  for (const r of ranges) params.append("ranges", r);
  const res = await sheetsFetch(token, `${BASE}/${encodeURIComponent(sheetId)}/values:batchGet?${params}`);
  const json = (await res.json()) as { valueRanges?: Array<{ values?: unknown[][] }> };
  return (json.valueRanges ?? []).map((v) => v.values ?? []);
}

/**
 * Reads whole tabs: headers as shown, and data rows with formulas (so photo links keep their URLs).
 * Row i in `rows` is sheet row i + 2.
 */
export async function readTabs(token: string, sheetId: string, tabs: string[]): Promise<Record<string, Tab>> {
  if (tabs.length === 0) return {};
  const [heads, data] = await Promise.all([
    batchGet(token, sheetId, tabs.map((t) => `${quote(t)}!1:1`), "FORMATTED_VALUE"),
    batchGet(token, sheetId, tabs.map((t) => `${quote(t)}!A2:AZ`), "FORMULA"),
  ]);
  const out: Record<string, Tab> = {};
  tabs.forEach((t, i) => {
    out[t] = { headers: readHeaders(heads[i]?.[0] ?? []), rows: data[i] ?? [] };
  });
  return out;
}

/** One row's cells (with formulas) plus the tab's headers. */
export async function readRow(token: string, sheetId: string, tab: string, row: number) {
  const [heads, data] = await Promise.all([
    batchGet(token, sheetId, [`${quote(tab)}!1:1`], "FORMATTED_VALUE"),
    batchGet(token, sheetId, [`${quote(tab)}!A${row}:AZ${row}`], "FORMULA"),
  ]);
  return { headers: readHeaders(heads[0]?.[0] ?? []), cells: data[0]?.[0] ?? [] };
}

/** Writes single cells in one row, as if typed (numbers stay numbers, dates become dates). */
export async function writeCells(token: string, sheetId: string, tab: string, row: number, cells: CellWrite[]) {
  await writeMany(token, sheetId, cells.map((c) => ({ tab, row, ...c })));
}

export async function writeMany(token: string, sheetId: string, cells: Array<CellWrite & { tab: string; row: number }>) {
  if (cells.length === 0) return;
  await sheetsFetch(token, `${BASE}/${encodeURIComponent(sheetId)}/values:batchUpdate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: cells.map((c) => ({ range: cellRange(c.tab, c.col, c.row), values: [[c.value]] })),
    }),
  });
}

/** The first empty row after the tab's last filled row in column A. */
export async function nextEmptyRow(token: string, sheetId: string, tab: string): Promise<number> {
  const [values] = await batchGet(token, sheetId, [`${quote(tab)}!A:A`], "FORMATTED_VALUE");
  return Math.max(2, (values?.length ?? 1) + 1);
}

/** Deletes one row from a tab. `gid` is the tab's numeric ID. */
export async function deleteRow(token: string, sheetId: string, gid: number, row: number) {
  await sheetsFetch(token, `${BASE}/${encodeURIComponent(sheetId)}:batchUpdate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requests: [{ deleteDimension: { range: { sheetId: gid, dimension: "ROWS", startIndex: row - 1, endIndex: row } } }],
    }),
  });
}

const REPRICE_LABEL = "reprice after (days)";

/**
 * Finds the "Reprice After (Days)" setting on the Summary tab. The nightly price check reads it there,
 * so the app keeps it and its own setting the same. Returns null when the sheet has no such row.
 */
async function findRepriceCell(token: string, sheetId: string): Promise<{ row: number; days: number | null } | null> {
  const res = await sheetsFetch(
    token,
    `${BASE}/${encodeURIComponent(sheetId)}/values/${encodeURIComponent("'Summary'!A1:B20")}?valueRenderOption=UNFORMATTED_VALUE`,
  ).catch(() => null);
  if (!res) return null;
  const rows = ((await res.json()) as { values?: unknown[][] }).values ?? [];
  const i = rows.findIndex((r) => String(r[0] ?? "").trim().toLowerCase() === REPRICE_LABEL);
  if (i < 0) return null;
  const n = Math.round(Number(rows[i]![1]));
  return { row: i + 1, days: Number.isFinite(n) && n > 0 ? n : null };
}

export async function readRepriceDays(token: string, sheetId: string): Promise<number | null> {
  return (await findRepriceCell(token, sheetId))?.days ?? null;
}

/** Writes the app's repricing window to the sheet. Returns false when the sheet has no setting row. */
export async function writeRepriceDays(token: string, sheetId: string, days: number): Promise<boolean> {
  const cell = await findRepriceCell(token, sheetId);
  if (!cell) return false;
  await writeMany(token, sheetId, [{ tab: "Summary", row: cell.row, col: 1, value: days }]);
  return true;
}
