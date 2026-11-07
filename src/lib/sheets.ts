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

/** Settings rows on the Summary tab, shared by the app, the sheet, and the nightly price check. */
export const SUMMARY_SETTINGS = {
  repriceAfterDays: "Reprice After (Days)",
  alertChangePct: "Alert On Change (%)",
  gradingCost: "Grading Cost (Each)",
} as const;
export type SummaryKey = keyof typeof SUMMARY_SETTINGS;
export type SummaryValues = Partial<Record<SummaryKey, { row: number; value: number | null }>>;

/** Reads the settings rows from the Summary tab. Missing rows are left out. */
export async function readSummarySettings(token: string, sheetId: string): Promise<SummaryValues> {
  const res = await sheetsFetch(
    token,
    `${BASE}/${encodeURIComponent(sheetId)}/values/${encodeURIComponent("'Summary'!A1:B20")}?valueRenderOption=UNFORMATTED_VALUE`,
  ).catch(() => null);
  if (!res) return {};
  const rows = ((await res.json()) as { values?: unknown[][] }).values ?? [];
  const out: SummaryValues = {};
  for (const [key, label] of Object.entries(SUMMARY_SETTINGS) as Array<[SummaryKey, string]>) {
    const i = rows.findIndex((r) => String(r[0] ?? "").trim().toLowerCase() === label.toLowerCase());
    if (i < 0) continue;
    const raw = rows[i]![1];
    const n = raw === "" || raw == null ? NaN : Number(raw);
    out[key] = { row: i + 1, value: Number.isFinite(n) && n >= 0 ? n : null };
  }
  return out;
}

/** Writes settings to their Summary rows. Returns the keys the sheet has no row for. */
export async function writeSummarySettings(
  token: string,
  sheetId: string,
  values: Partial<Record<SummaryKey, number | null>>,
): Promise<SummaryKey[]> {
  const found = await readSummarySettings(token, sheetId);
  const missing: SummaryKey[] = [];
  const writes: Array<CellWrite & { tab: string; row: number }> = [];
  for (const [key, value] of Object.entries(values) as Array<[SummaryKey, number | null]>) {
    const cell = found[key];
    if (!cell) missing.push(key);
    else writes.push({ tab: "Summary", row: cell.row, col: 1, value: value ?? "" });
  }
  await writeMany(token, sheetId, writes);
  return missing;
}
