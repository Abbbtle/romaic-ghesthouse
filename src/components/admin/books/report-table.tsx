import { cx } from "@/components/ui/cx";
import { formatCents } from "@/lib/format/money";
import type { ReportRow, ReportTable } from "./report-model";

// The bottom line sits under a 2 px Romaic Gold rule, like Today's in the calendar: structure only (it's bold and larger as well), never the only cue.
const rowStyles: Record<ReportRow["kind"], string> = {
  line: "",
  total: "border-t border-hairline font-bold",
  result: "border-t-2 border-romaic-gold font-bold text-ink",
};

/** Whether a statement has anything in it: a line with an amount that isn't nothing. */
export function hasFigures(table: ReportTable): boolean {
  return table.sections.some((section) => section.rows.some((row) => row.kind === "line" && row.cells.some((cell) => cell !== null && cell !== 0)));
}

/**
 * A statement as a table: each account with its code, sections under their
 * plain headings (with the accountant's word for them beneath), totals ruled
 * off and the bottom line in bold under a gold rule. Amounts are right
 * aligned in tabular figures. On a narrow phone a two-column statement
 * scrolls sideways inside its frame, never the page.
 */
export function ReportTableView({ table, caption }: { table: ReportTable; caption: string }) {
  const columnCount = 1 + table.columns.length;
  return (
    <div className="relative min-w-0 overflow-x-auto">
      <table className="w-full border-collapse text-left text-base" style={{ minWidth: table.columns.length > 1 ? "24rem" : "16rem" }}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="border-b border-hairline px-4 py-2.5 text-sm font-medium text-fg-2 lg:px-5">
              Account
            </th>
            {table.columns.map((column) => (
              <th key={column} scope="col" className="border-b border-hairline px-4 py-2.5 text-right text-sm font-medium whitespace-nowrap text-fg-2 lg:px-5">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        {table.sections.map((section, sectionIndex) => (
          <tbody key={sectionIndex}>
            {section.title && (
              <tr>
                <th scope="colgroup" colSpan={columnCount} className="px-4 pt-5 pb-1.5 text-left lg:px-5">
                  <span className="block text-sm font-bold text-ink">{section.title}</span>
                  {section.term && <span className="block text-xs font-normal text-fg-3">{section.term}</span>}
                </th>
              </tr>
            )}
            {section.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className={rowStyles[row.kind]}>
                <th scope="row" className={cx("px-4 py-2 text-left align-top lg:px-5", row.kind === "line" ? "font-normal text-fg" : "font-bold")}>
                  {row.code && <span className="mr-2 text-sm font-normal text-fg-3 tabular-nums">{row.code}</span>}
                  {row.label}
                </th>
                {row.cells.map((cell, cellIndex) => (
                  <td key={cellIndex} className={cx("px-4 py-2 text-right align-top whitespace-nowrap tabular-nums lg:px-5", row.kind === "result" && "text-h4")} data-numeric>
                    {cell === null ? "" : formatCents(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
