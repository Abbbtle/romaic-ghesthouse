import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

/**
 * The reports' charts, drawn as inline SVG on the server (the dataviz
 * skill's method, in the Romaic palette):
 *
 * - One data colour, #245e93: the brand's info blue (info-600's hue and
 *   lightness, OKLCH L 0.47) with its chroma lifted from 0.095 to 0.105 so
 *   it clears the skill's chroma floor; 6.8:1 on the white panel. Every chart
 *   here is a single series, so nothing needs a legend and nothing is told
 *   apart by colour. Gold stays structural (DESIGN.md, Decision 5).
 * - A column for a week or month the dates cut short is navy-300, lighter,
 *   so a part-week isn't read as a quiet week; the panel says so in words.
 *   It's 2.6:1 on white, under the 3:1 marks aim, so its figure is always in
 *   the chart's table and tooltip as well.
 * - Meter tracks are info-100, a lighter step of the same ramp. Gridlines
 *   are neutral-200 hairlines, the baseline neutral-300; axis text is fg-3.
 * - The dashboard has no dark theme, so there's no dark set.
 *
 * Every chart's figures are also in text: a meter list prints each row's
 * figure beside its bar, and a column chart carries a table for screen
 * readers (and a tooltip per column for pointers). The SVG itself is hidden
 * from screen readers.
 */

const seriesFill = "fill-[#245e93]";
const trackFill = "fill-info-100";

// --- bar and meter lists -----------------------------------------------------------------

export type BarRow = {
  key: string;
  label: ReactNode;
  /** A second line under the label: "120 of 186 nights booked". */
  detail?: ReactNode;
  /** The row's figure, printed beside its bar: "64%", "R45,000". */
  figure: ReactNode;
  /** How far the bar reaches, 0 to 1; null draws none (a meter keeps its track). */
  share: number | null;
};

/**
 * A bar from the left edge, `share` of the width: square where it starts,
 * rounded at its end. A meter's fill is rounded at both ends, inside its
 * track (a lighter step of the same blue).
 */
export function Bar({ share, variant, height = 10, className }: { share: number | null; variant: "meter" | "bar"; height?: number; className?: string }) {
  const percent = share === null ? 0 : Math.max(0, Math.min(1, share)) * 100;
  const radius = variant === "meter" ? height / 2 : Math.min(4, height / 2);
  return (
    <svg width="100%" height={height} aria-hidden="true" focusable="false" className={cx("block overflow-visible", className)}>
      {variant === "meter" && <rect x="0" y="0" width="100%" height={height} rx={height / 2} className={trackFill} />}
      {percent > 0 && (
        <>
          <rect x="0" y="0" width={`${percent}%`} height={height} rx={radius} className={seriesFill} />
          {variant === "bar" && <rect x="0" y="0" width={`${percent / 2}%`} height={height} className={seriesFill} />}
        </>
      )}
    </svg>
  );
}

/**
 * Named rows, each with a bar and its figure: a meter list (each row a share
 * of its own whole, on a track) or ranked bars (rows against the largest).
 * On phones the bar runs under the name; from 640 px it sits between the
 * name and the figure, so the bars line up.
 */
export function BarList({ label, rows, variant }: { label: string; rows: readonly BarRow[]; variant: "meter" | "bar" }) {
  return (
    <ul aria-label={label} className="divide-y divide-hairline">
      {rows.map((row) => (
        <li
          key={row.key}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_minmax(5rem,auto)] sm:items-center lg:px-5"
        >
          <div className="min-w-0">
            <span className="font-medium text-ink">{row.label}</span>
            {row.detail && <span className="block text-sm text-fg-3">{row.detail}</span>}
          </div>
          <div className="text-right font-bold whitespace-nowrap text-ink tabular-nums sm:order-3">{row.figure}</div>
          <div className="col-span-2 sm:order-2 sm:col-span-1">
            <Bar share={row.share} variant={variant} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// --- column chart ----------------------------------------------------------------------

export type Column = {
  key: string;
  /** The axis label under the column ("Nov", "2 Nov"), or null for none. */
  label: string | null;
  /** Keep this column's label on phones too (the rest show from 640 px). */
  labelOnPhone?: boolean;
  /** What a pointer resting on the column shows: "Week of 2 Nov: 9 cleans". */
  title: string;
  value: number;
  /** A week or month the dates cut short: drawn lighter. */
  partial?: boolean;
};

export type ChartTable = { caption: string; headings: readonly [string, string]; rows: readonly (readonly [string, string])[] };

const padTop = 22;
const plotHeight = 160;
const axisBand = 26;
const chartHeight = padTop + plotHeight + axisBand;
/** The widest a column's slot gets, so a 37.5% bar stays at most 24 px. */
const maxSlotRem = 4;

/**
 * Columns over time from one baseline, with round ticks at the left and the
 * highlighted column's value on its cap. Columns are placed in percentages,
 * so the chart fits any width without scrolling; the chart stops growing at
 * 4 rem per column, so a column is never wider than 24 px.
 */
export function ColumnChart({
  label,
  columns,
  top,
  ticks,
  highlight,
  table,
}: {
  /** What the chart shows, for screen readers: "Cleans done per week, 2 Nov to 29 Nov 2026". */
  label: string;
  columns: readonly Column[];
  /** The value at the top of the plot (the highest tick). */
  top: number;
  ticks: readonly { value: number; label: string }[];
  /** The one column whose value is printed on its cap: the busiest week, the best month. */
  highlight?: { key: string; label: string } | null;
  /** The same figures as a table, for screen readers. */
  table: ChartTable;
}) {
  const y = (value: number) => padTop + plotHeight - (top > 0 ? (value / top) * plotHeight : 0);
  const slot = 100 / Math.max(1, columns.length);
  return (
    <figure aria-label={label} className="relative m-0 flex min-w-0 gap-2">
      <div aria-hidden="true" className="relative w-14 shrink-0" style={{ height: chartHeight }}>
        {ticks.map((tick) => (
          <span key={tick.value} className="absolute right-0 -translate-y-1/2 text-xs whitespace-nowrap text-fg-3 tabular-nums" style={{ top: y(tick.value) }}>
            {tick.label}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1" style={{ maxWidth: `${columns.length * maxSlotRem}rem` }}>
        <svg width="100%" height={chartHeight} aria-hidden="true" focusable="false" className="block overflow-visible">
          {ticks.map((tick) => (
            <line key={tick.value} x1="0" x2="100%" y1={y(tick.value)} y2={y(tick.value)} className={tick.value === 0 ? "stroke-neutral-300" : "stroke-neutral-200"} strokeWidth="1" />
          ))}
          {columns.map((column, index) => {
            const height = Math.max(0, y(0) - y(column.value));
            const cap = Math.min(4, height);
            return (
              <svg key={column.key} x={`${index * slot}%`} y="0" width={`${slot}%`} height={chartHeight} overflow="visible" className="group">
                <title>{column.title}</title>
                <rect x="0" y={padTop} width="100%" height={plotHeight} fill="transparent" />
                {height > 0 && (
                  <g className={cx(column.partial ? "fill-navy-300" : seriesFill, "transition-opacity duration-150 group-hover:opacity-75")}>
                    <rect x="31.25%" y={y(column.value)} width="37.5%" height={height} rx="4" />
                    <rect x="31.25%" y={y(0) - cap} width="37.5%" height={cap} />
                  </g>
                )}
                {highlight?.key === column.key && (
                  <text x="50%" y={y(column.value) - 7} textAnchor="middle" className="fill-ink text-xs font-bold">
                    {highlight.label}
                  </text>
                )}
                {column.label && (
                  <text x="50%" y={padTop + plotHeight + 17} textAnchor="middle" className={cx("fill-fg-3 text-xs", !column.labelOnPhone && "max-sm:hidden")}>
                    {column.label}
                  </text>
                )}
              </svg>
            );
          })}
        </svg>
      </div>
      <table className="sr-only">
        <caption>{table.caption}</caption>
        <thead>
          <tr>
            <th scope="col">{table.headings[0]}</th>
            <th scope="col">{table.headings[1]}</th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map(([name, value]) => (
            <tr key={name}>
              <th scope="row">{name}</th>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
