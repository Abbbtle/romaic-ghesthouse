import type { ReactNode } from "react";
import { preparedNote } from "./report-model";

/**
 * Printing shows only the statement: everything else on the page (the
 * dashboard's navigation, this page's header and buttons) is left out, and
 * the elements around it lose their padding and borders. The dashboard's
 * policy only runs <style> elements carrying its nonce.
 */
const printCss = `
@media print {
  @page { margin: 14mm; }
  html, body { background: #fff !important; }
  body *:not(:has([data-print-document])):not([data-print-document]):not([data-print-document] *) { display: none !important; }
  body *:has([data-print-document]) {
    display: block !important; position: static !important; margin: 0 !important; padding: 0 !important; border: 0 !important;
    background: none !important; box-shadow: none !important; overflow: visible !important; height: auto !important;
    min-height: 0 !important; max-width: none !important; width: auto !important;
  }
  [data-print-document] { border: 0 !important; padding: 0 !important; box-shadow: none !important; max-width: none !important; }
  [data-print-document] table { min-width: 0 !important; }
}
`;

/**
 * A statement laid out as a page to print or save as a PDF: the business,
 * the statement's name and dates, the line saying who it's for, the figures,
 * and when it was printed.
 */
export function PrintableReport({
  nonce,
  businessName,
  title,
  period,
  printedAt,
  children,
}: {
  nonce: string | undefined;
  businessName: string;
  title: string;
  /** "1 Mar – 12 Nov 2026", "On 12 Nov 2026". */
  period: string;
  /** "12 Nov 2026 at 14:05". */
  printedAt: string;
  children: ReactNode;
}) {
  return (
    <>
      <style nonce={nonce}>{printCss}</style>
      <article data-print-document className="grid max-w-[52rem] gap-6 rounded-md border border-hairline bg-white py-5 text-ink sm:py-8">
        <header className="grid gap-1 px-4 lg:px-5">
          <p className="text-base font-bold">{businessName}</p>
          <h2 className="text-h2 font-bold">{title}</h2>
          <p className="text-base">{period}</p>
          <p className="text-sm text-fg-2">{preparedNote}</p>
        </header>
        {children}
        <footer className="border-t border-hairline px-4 pt-4 text-sm text-fg-2 lg:px-5">Printed {printedAt}.</footer>
      </article>
    </>
  );
}
