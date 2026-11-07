/** A plain GET form, so search works without JavaScript and the query stays in the URL. */
export function SearchBox({ action, defaultValue, placeholder, hidden }: { action: string; defaultValue?: string; placeholder: string; hidden?: Record<string, string> }) {
  return (
    <form action={action} method="get" role="search" className="flex gap-2">
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className="sr-only" htmlFor="q">
        Search
      </label>
      <input
        id="q"
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="search"
        className="min-h-11 flex-1 min-w-0 rounded-xl border border-line bg-surface px-3 text-base"
      />
      <button type="submit" className="min-h-11 rounded-xl bg-navy px-4 font-medium text-navy-ink">
        Search
      </button>
    </form>
  );
}
