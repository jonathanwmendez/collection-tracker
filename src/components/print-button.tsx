"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="min-h-9 inline-flex items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink print:hidden"
    >
      Print or save as PDF
    </button>
  );
}
