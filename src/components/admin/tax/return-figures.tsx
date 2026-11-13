import { Info, TriangleAlert } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { disclaimer } from "@/lib/tax/returns";

/** A figure as the page shows it, worded and formatted on the server. */
export type FigureRow = { key: string; label: string; value: string; strong: boolean };

/** The line every return page, print view and export carries. */
export function ReturnDisclaimer({ className }: { className?: string }) {
  return (
    <p className={cx("flex items-start gap-2 rounded-sm border border-hairline bg-chalk px-4 py-3 text-sm text-fg-2", className)}>
      <Info aria-hidden="true" strokeWidth={1.75} className="mt-0.5 size-4 shrink-0 text-fg-3" />
      <span>{disclaimer}</span>
    </p>
  );
}

/**
 * A return's figures as a ledger, edge to edge in a flush Panel: what each
 * is on the left, the amount right-aligned in tabular figures, the total in
 * bold. Then what to check, and notes on how they were worked out, each as
 * its own band under a hairline.
 */
export function ReturnFigures({ rows, warnings, notes }: { rows: readonly FigureRow[]; warnings: readonly string[]; notes: readonly string[] }) {
  return (
    <div className="divide-y divide-hairline">
      <dl className="divide-y divide-hairline">
        {rows.map((row) => (
          <div key={row.key} className="flex items-baseline justify-between gap-4 px-4 py-3 lg:px-5">
            <dt className={row.strong ? "font-bold text-ink" : "text-fg-2"}>{row.label}</dt>
            <dd className={cx("shrink-0 text-right tabular-nums", row.strong ? "text-h4 font-bold text-ink" : "text-base text-ink")} data-numeric>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      {warnings.length > 0 && (
        <ul aria-label="Check before relying on these figures" className="divide-y divide-warning-100 bg-warning-50 text-sm text-warning-800">
          {warnings.map((warning) => (
            <li key={warning} className="flex items-start gap-2 px-4 py-3 lg:px-5">
              <TriangleAlert aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0" />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      )}
      {notes.length > 0 && (
        <ul aria-label="How these figures were worked out" className="grid list-disc gap-1 py-3 pr-4 pl-9 text-sm text-fg-2 lg:pr-5 lg:pl-10">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
