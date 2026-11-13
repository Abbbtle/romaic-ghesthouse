import type { ReactNode } from "react";
import { disclaimer } from "@/lib/tax/returns";
import type { FigureRow } from "./return-figures";

/**
 * Printing shows only the return: everything else on the page is left out,
 * and the elements around it lose their padding and borders. The
 * dashboard's policy only runs <style> elements carrying its nonce.
 */
const printCss = `
@media print {
  @page { margin: 14mm; }
  html, body { background: #fff !important; }
  body *:not(:has([data-print-return])):not([data-print-return]):not([data-print-return] *) { display: none !important; }
  body *:has([data-print-return]) {
    display: block !important; position: static !important; margin: 0 !important; padding: 0 !important; border: 0 !important;
    background: none !important; box-shadow: none !important; overflow: visible !important; height: auto !important;
    min-height: 0 !important; max-width: none !important; width: auto !important;
  }
  [data-print-return] { border: 0 !important; padding: 0 !important; box-shadow: none !important; max-width: none !important; }
}
`;

/** One labelled fact: "Period", "Status". */
export function ReturnFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs font-bold tracking-wide text-fg-3 uppercase">{label}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  );
}

/**
 * A return laid out as a page for the accountant: the business, the
 * return's facts, its figures, what to check, the rates and dates used with
 * their sars.gov.za pages, and the disclaimer, top and bottom.
 */
export function PrintableReturn({
  nonce,
  businessName,
  title,
  facts,
  rows,
  warnings,
  notes,
  parameters,
  journalCount,
}: {
  nonce: string | undefined;
  businessName: string;
  title: string;
  facts: ReactNode;
  rows: readonly FigureRow[];
  warnings: readonly string[];
  notes: readonly string[];
  parameters: readonly { key: string; name: string; value: string; source: string; checked: string }[];
  journalCount: number;
}) {
  return (
    <>
      <style nonce={nonce}>{printCss}</style>
      <article data-print-return className="grid max-w-[52rem] gap-6 rounded-md border border-hairline bg-white p-5 text-ink sm:p-10">
        <p className="rounded-sm border border-ink px-4 py-3 text-sm font-bold">{disclaimer}</p>
        <header className="grid gap-1">
          <p className="text-base font-bold">{businessName}</p>
          <h2 className="text-h2 font-bold">{title}</h2>
        </header>
        <dl className="grid gap-4 sm:grid-cols-2">{facts}</dl>
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Figures</caption>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-hairline">
                <th scope="row" className={row.strong ? "py-2 pr-4 text-left font-bold" : "py-2 pr-4 text-left font-normal"}>
                  {row.label}
                </th>
                <td className={row.strong ? "py-2 text-right font-bold tabular-nums" : "py-2 text-right tabular-nums"}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {warnings.length > 0 && (
          <section className="grid gap-1 text-sm">
            <h3 className="font-bold">Check before relying on these figures</h3>
            <ul className="list-disc pl-5">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </section>
        )}
        {notes.length > 0 && (
          <section className="grid gap-1 text-sm">
            <h3 className="font-bold">How they were worked out</h3>
            <ul className="list-disc pl-5">
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <p>{journalCount === 1 ? "One journal in the books is" : `${journalCount} journals in the books are`} behind these figures: the CSV export lists them line by line.</p>
          </section>
        )}
        {parameters.length > 0 && (
          <section className="grid gap-1 text-sm">
            <h3 className="font-bold">Rates and dates used</h3>
            <ul className="grid gap-1">
              {parameters.map((parameter) => (
                <li key={parameter.key}>
                  {parameter.name}: {parameter.value} <span className="break-all text-fg-2">({parameter.source}, checked {parameter.checked})</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="border-t border-hairline pt-4 text-sm">{disclaimer}</p>
      </article>
    </>
  );
}
