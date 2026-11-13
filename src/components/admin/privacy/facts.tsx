import type { ReactNode } from "react";

/** Facts about one record, a row each, divided by hairlines: for a flush Panel. */
export function Facts({ children }: { children: ReactNode }) {
  return <dl className="divide-y divide-hairline">{children}</dl>;
}

/** One fact: its name on the left and its value on the right, stacked on phones. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 px-4 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4 lg:px-5">
      <dt className="text-sm text-fg-2">{label}</dt>
      <dd className="min-w-0 break-words whitespace-pre-line text-ink">{children}</dd>
    </div>
  );
}
