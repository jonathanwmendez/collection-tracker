export function Unavailable() {
  return (
    <section className="rounded-2xl border border-dashed border-line bg-surface px-5 py-10 flex flex-col items-center text-center gap-2">
      <h1 className="text-lg font-medium">This link isn&apos;t available</h1>
      <p className="text-muted max-w-[46ch]">It may have expired or been turned off. Ask the person who shared it for a new link.</p>
    </section>
  );
}
