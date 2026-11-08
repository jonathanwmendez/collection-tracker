// Scans waiting to be read, uploaded, and saved. Kept in the phone's IndexedDB, so nothing is lost if the
// signal drops, the page reloads, or the phone locks. Browser only.

import type { CardKind, OcrLine } from "./card-text";

// "auto": the app works out what it is. The others are from older versions of the Scan page.
export type ScanKindKey = "auto" | "sports" | "magic" | "pokemon" | "yugioh" | `item:${string}`;

export type QueuedScan = {
  id: string;
  createdAt: number;
  kind: ScanKindKey;
  location: string;
  condition: string;
  front: Blob;
  back?: Blob;
  coa?: Blob;
  /** Text already read from the front while scanning, so it isn't read twice. */
  frontText?: OcrLine[];
  /** The kind of card, when the front made it clear while scanning. */
  detected?: CardKind | null;
};

const DB = "collection-tracker-scans";
const STORE = "queue";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

export async function putScan(scan: QueuedScan) {
  try {
    await tx("readwrite", (s) => s.put(scan));
  } catch (e) {
    console.warn("Couldn't keep the scan on this phone", e);
  }
}

export async function removeScan(id: string) {
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch {
    /* already gone */
  }
}

export async function pendingScans(): Promise<QueuedScan[]> {
  try {
    const all = await tx<QueuedScan[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedScan[]>);
    return all.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}
