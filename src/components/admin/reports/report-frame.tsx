import { Check, Download } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ButtonAnchor } from "@/components/ui/button";
import { inputClasses, labelClasses } from "@/components/ui/form-controls";
import type { ReportRange } from "@/lib/reports/report-range";
import { Tabs } from "../tabs";
import { reportSources, reportSummaries, reportTitles, type ReportKind } from "./report-model";

/** The two Reports pages: the house (no money; the owner and sales) and money (the owner). */
export function ReportTabs({ current, houseHref, moneyHref }: { current: "house" | "money"; houseHref: string; moneyHref: string | null }) {
  const items = [{ href: houseHref, label: "The house" }, ...(moneyHref ? [{ href: moneyHref, label: "Money" }] : [])];
  return <Tabs label="Reports" items={items} current={current === "house" ? houseHref : (moneyHref ?? houseHref)} className="mb-5" />;
}

const dateInput = inputClasses("compact", "mt-1.5 tabular-nums");

/**
 * The one row of date choices above every report on the page: presets as
 * links (the current one ticked), then any dates. A plain GET form, so it
 * works before scripts load and every view has its own address.
 */
export function RangeControls({ action, range, presets }: { action: string; range: ReportRange; presets: readonly { label: string; href: string; current: boolean }[] }) {
  return (
    <form action={action} aria-label="Dates" className="grid gap-4 rounded-md border border-hairline bg-white p-4 lg:p-5">
      <nav aria-label="Choose dates" className="flex flex-wrap gap-x-5 gap-y-1">
        {presets.map((preset) =>
          preset.current ? (
            <span key={preset.label} aria-current="true" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-ink pointer-fine:min-h-9">
              <Check aria-hidden="true" strokeWidth={2.5} className="size-4" />
              {preset.label}
            </span>
          ) : (
            <Link key={preset.label} href={preset.href} className="inline-flex min-h-11 items-center text-sm font-bold text-link underline underline-offset-4 pointer-fine:min-h-9">
              {preset.label}
            </Link>
          ),
        )}
      </nav>
      <div className="grid grid-cols-2 gap-4 border-t border-hairline pt-4 sm:grid-cols-[10rem_10rem_auto] sm:items-end">
        <div className="min-w-0">
          <label htmlFor="report-from" className={labelClasses}>
            From
          </label>
          <input id="report-from" name="from" type="date" required defaultValue={range.from} className={dateInput} />
        </div>
        <div className="min-w-0">
          <label htmlFor="report-until" className={labelClasses}>
            Until
          </label>
          <input id="report-until" name="until" type="date" required defaultValue={range.until} className={dateInput} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <button type="submit" className="inline-flex min-h-11 items-center rounded-sm whitespace-nowrap border-[1.5px] border-ink bg-white px-4 text-sm font-bold text-ink hover:bg-chalk">
            Show these dates
          </button>
        </div>
      </div>
    </form>
  );
}

/**
 * The dates' heading, with the period in one line under it ("10% full ·
 * 3 arrivals · 3 departures · no cleans"); the reports under it say the rest.
 */
export function RangeHeading({ title, summary }: { title: string; summary: string }) {
  return (
    <div className="grid gap-1">
      <h2 className="text-h3 font-bold text-ink">{title}</h2>
      <p className="text-base text-fg-2">{summary}</p>
    </div>
  );
}

/**
 * A report's download. A plain link, not a `download` one: the file comes
 * back as an attachment, and when a money report first asks for the
 * password and code again, the browser follows to that page instead of
 * saving it as the file.
 */
export function DownloadLink({ href }: { href: string }) {
  return (
    <ButtonAnchor href={href} size="sm" variant="secondary" icon={<Download aria-hidden="true" />}>
      Download CSV
    </ButtonAnchor>
  );
}

/**
 * One report: a white panel with the report's title and its one plain line,
 * "Download CSV" in the same place on every report (under the line on
 * phones, opposite the title from 640 px), the figures, any notes about
 * these dates, and the full account of what's counted folded into "How
 * this is counted" at the foot.
 */
export function ReportPanel({
  kind,
  downloadHref,
  notes = [],
  counting = [],
  children,
}: {
  kind: ReportKind;
  /** The report's CSV, or null when there's nothing to download or the person may not. */
  downloadHref: string | null;
  /** Shown under the figures: what to know about these dates ("Lighter columns are months the dates cut short."). */
  notes?: readonly string[];
  /** More on how it's counted, after the report's definition, inside "How this is counted". */
  counting?: readonly string[];
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-hairline bg-white">
      <div className="grid gap-x-6 gap-y-3 border-b border-hairline px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center lg:px-5">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-ink">{reportTitles[kind]}</h3>
          <p className="mt-0.5 text-sm text-fg-2">{reportSummaries[kind]}</p>
        </div>
        {downloadHref && (
          <div className="justify-self-start sm:justify-self-end">
            <DownloadLink href={downloadHref} />
          </div>
        )}
      </div>
      {children}
      <div className="border-t border-hairline px-4 text-sm text-fg-2 lg:px-5">
        {notes.length > 0 && (
          <div className="grid gap-1.5 pt-3">
            {notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        )}
        <details>
          <summary className="min-h-11 cursor-pointer py-2.5 font-medium text-link">How this is counted</summary>
          <div className="grid max-w-prose gap-1.5 pb-3">
            <p>{reportSources[kind]}</p>
            {counting.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </details>
      </div>
    </section>
  );
}

/** A heading inside a report's panel: "By month", "By room type". */
export function ReportSubheading({ children }: { children: ReactNode }) {
  return <h4 className="border-b border-hairline bg-neutral-25 px-4 py-2 text-sm font-bold text-ink lg:px-5">{children}</h4>;
}
