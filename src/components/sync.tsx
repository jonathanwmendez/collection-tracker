"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { timeAgo } from "@/lib/format";
import { Notice } from "./notice";

type SyncState = {
  syncing: boolean;
  lastSyncedAt: string | null;
  error: { message: string; needsSignIn?: boolean } | null;
  sync: () => Promise<boolean>;
};

const SyncContext = createContext<SyncState | null>(null);

const STALE_MS = 2 * 60 * 1000;

/**
 * Keeps the app in step with the Google Sheet. Syncs when the app opens and whenever you come back to it
 * (for example after adding items in Collection Intake), if the last sync is more than 2 minutes old.
 */
export function SyncProvider({
  connected,
  lastSyncedAt: initial,
  children,
}: {
  connected: boolean;
  lastSyncedAt: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLast] = useState(initial);
  const [error, setError] = useState<SyncState["error"]>(null);
  const busy = useRef(false);
  const last = useRef(initial);

  const sync = useCallback(async () => {
    if (busy.current || !connected) return false;
    busy.current = true;
    setSyncing(true);
    const r = await api<{ syncedAt: string }>("/api/sync", { method: "POST" });
    busy.current = false;
    setSyncing(false);
    if (!r.ok) {
      setError({ message: r.error, needsSignIn: r.needsSignIn });
      return false;
    }
    setError(null);
    last.current = r.data.syncedAt;
    setLast(r.data.syncedAt);
    router.refresh();
    return true;
  }, [connected, router]);

  useEffect(() => {
    if (!connected) return;
    const maybe = () => {
      if (document.visibilityState !== "visible") return;
      const age = last.current ? Date.now() - new Date(last.current).getTime() : Infinity;
      if (age > STALE_MS) void sync();
    };
    maybe();
    document.addEventListener("visibilitychange", maybe);
    window.addEventListener("focus", maybe);
    return () => {
      document.removeEventListener("visibilitychange", maybe);
      window.removeEventListener("focus", maybe);
    };
  }, [connected, sync]);

  return <SyncContext.Provider value={{ syncing, lastSyncedAt, error, sync }}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncState {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync needs SyncProvider");
  return ctx;
}

/** "Synced 3 min ago" with a Sync now button, plus any sync error. */
export function SyncBar() {
  const { syncing, lastSyncedAt, error, sync } = useSync();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted" aria-live="polite">
          {syncing ? "Syncing with your sheet…" : `Synced with your sheet ${timeAgo(lastSyncedAt)}`}
        </span>
        <button
          type="button"
          onClick={() => void sync()}
          disabled={syncing}
          className="min-h-9 rounded-lg border border-line bg-surface px-3 font-medium disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </div>
      {error && (
        <Notice kind="bad" needsSignIn={error.needsSignIn}>
          {error.message}
        </Notice>
      )}
    </div>
  );
}
