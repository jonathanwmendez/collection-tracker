export function EmptyState({
  title,
  body,
  note,
  children,
}: {
  title: string;
  body: string;
  note?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-dashed border-line bg-surface px-5 py-10 flex flex-col items-center text-center gap-3">
      <h2 className="text-lg font-medium text-balance">{title}</h2>
      <p className="text-muted max-w-[46ch]">{body}</p>
      {children}
      {note && <p className="text-xs text-muted">{note}</p>}
    </section>
  );
}
