export function Notice({
  kind = "info",
  children,
  needsSignIn,
}: {
  kind?: "info" | "warn" | "bad" | "ok";
  children: React.ReactNode;
  needsSignIn?: boolean;
}) {
  const tone = {
    info: "bg-navy-soft text-ink",
    warn: "bg-warn-soft text-warn",
    bad: "bg-bad-soft text-bad",
    ok: "bg-ok-soft text-ok",
  }[kind];
  return (
    <div role={kind === "bad" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm ${tone} flex flex-col gap-2`}>
      <div>{children}</div>
      {needsSignIn && (
        <form action="/auth/signout" method="post">
          <button type="submit" className="min-h-9 rounded-lg bg-surface text-ink border border-line px-3 text-sm font-medium">
            Sign out to reconnect Google
          </button>
        </form>
      )}
    </div>
  );
}
