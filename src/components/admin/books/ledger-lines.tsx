import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

/** Lines of a short ledger, divided by hairlines, edge to edge in a flush Panel. */
export function LedgerList({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <dl aria-label={label} className="divide-y divide-hairline">
      {children}
    </dl>
  );
}

/** One line of a short ledger: what it is on the left (with an optional note under it), the amount right-aligned in tabular figures. */
export function LedgerLine({ label, value, note, strong = false }: { label: ReactNode; value: string; note?: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3 lg:px-5">
      <dt className={strong ? "font-bold text-ink" : "text-fg-2"}>
        {label}
        {note && <span className="block text-xs font-normal text-fg-3">{note}</span>}
      </dt>
      <dd className={cx("text-right whitespace-nowrap tabular-nums", strong ? "text-h4 font-bold text-ink" : "text-base text-ink")} data-numeric>
        {value}
      </dd>
    </div>
  );
}
