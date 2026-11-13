import type { Metadata } from "next";
import { List, ListRow } from "@/components/admin/list";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { LegalPointText } from "@/components/admin/privacy/privacy-labels";
import { PrivacyTabs } from "@/components/admin/privacy/privacy-tabs";
import { ConfirmRuleButton, PeriodSheet } from "@/components/admin/privacy/retention-forms";
import { StatusPill } from "@/components/admin/status-pill";
import { ExternalLink } from "@/components/ui/external-link";
import { formatDateShort, formatTime } from "@/lib/format/date-time";
import { businessTimeZone, zonedToday } from "@/lib/format/zoned-time";
import { isAdjustable, type ScheduleRow } from "@/lib/privacy/retention";
import { retentionPoints } from "@/lib/privacy/sources";
import type { RetentionPreview } from "@/lib/privacy/privacy-service";
import { requireDashboardActor } from "@/server/admin-session";
import { privacyService } from "@/server/privacy";
import { confirmRetentionRule, setRetentionPeriod } from "../actions";

export const metadata: Metadata = { title: "Keeping records" };

const plural = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;
const day = (instant: Date) => formatDateShort(zonedToday(instant, businessTimeZone));

function PreviewLine({ label, count, noun, runs, reason, since }: { label: string; count: number | null; noun: [string, string]; runs: boolean; reason: string | null; since: string | null }) {
  return (
    <ListRow trailing={runs ? <StatusPill tone="success">Runs daily</StatusPill> : <StatusPill tone="warning">Not running</StatusPill>}>
      <span className="block font-medium text-ink">{label}</span>
      <span className="block text-sm text-fg-2">
        {count === null ? "Can't be counted yet." : `${plural(count, ...noun)} ${runs ? "on the next run" : "if you confirm it now"}${since ? `: ${since}` : ""}.`}
      </span>
      {reason && <span className="block text-sm text-fg-2">{reason}</span>}
    </ListRow>
  );
}

function Preview({ preview }: { preview: RetentionPreview }) {
  return (
    <List label="What the next run would do">
      <PreviewLine
        label="Guest records anonymised"
        count={preview.guests.count}
        noun={["guest record", "guest records"]}
        runs={preview.guests.runs}
        reason={preview.guests.reason}
        since={preview.guests.cutoff ? `no stay, payment or invoice since ${formatDateShort(preview.guests.cutoff)}` : null}
      />
      <PreviewLine
        label="Task photos deleted"
        count={preview.taskPhotos.count}
        noun={["photo", "photos"]}
        runs={preview.taskPhotos.runs}
        reason={preview.taskPhotos.reason}
        since={preview.taskPhotos.cutoff ? `on tasks done before ${day(preview.taskPhotos.cutoff)}` : null}
      />
    </List>
  );
}

function RuleRow({ row, primary }: { row: ScheduleRow; primary: boolean }) {
  const range = row.adjustable && "min" in row.adjustable.range ? row.adjustable.range : null;
  const applies = isAdjustable(row.kind);
  return (
    <li className="grid gap-2 px-4 py-4 lg:px-5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <h3 className="min-w-0 font-bold text-ink">{row.name}</h3>
        {row.confirmed ? <StatusPill tone="success">Confirmed</StatusPill> : <StatusPill tone="warning">Default: to confirm</StatusPill>}
      </div>
      <p className="text-base text-ink">{row.rule}</p>
      {row.note && <p className="text-sm text-fg-2">{row.note}</p>}
      <p className="text-sm text-fg-2">
        {row.appliedBy}
        {row.confirmed ? ` Confirmed by ${row.confirmed.setByName} on ${day(row.confirmed.setAt)} (version ${row.confirmed.version}).` : ""}
      </p>
      {(range || !row.confirmed) && (
        <div className="flex flex-wrap items-center gap-3">
          {!row.confirmed && (row.adjustable === null || row.adjustable.period !== null) && (
            <ConfirmRuleButton kind={row.kind} name={row.name} rule={row.rule} applies={applies} primary={primary} action={confirmRetentionRule} />
          )}
          {row.adjustable && range && (
            <PeriodSheet kind={row.kind} name={row.name} unit={row.adjustable.unit} period={row.adjustable.period} range={range} action={setRetentionPeriod} />
          )}
        </div>
      )}
    </li>
  );
}

/**
 * The retention schedule (Pattern: settings list): what the next daily run
 * would do (counts only), every kind of record with its rule in words and
 * whether the owner has confirmed it, what the Act says, and the latest
 * runs. Nothing is anonymised or deleted until its rule is confirmed. Owner
 * only (privacy:requests).
 */
export default async function RetentionPage() {
  const actor = await requireDashboardActor({ permission: "privacy:requests" });
  const { keeping, schedule, preview, runs } = await privacyService().retention(actor);
  const firstToConfirm = schedule.find((row) => !row.confirmed && (row.adjustable === null || row.adjustable.period !== null))?.kind;

  return (
    <>
      <PageHeader title="Keeping records" description="How long each kind of record is kept, and what the daily job does after. Nothing is anonymised or deleted until you confirm its rule." />
      <PrivacyTabs current="retention" />
      <div className="grid max-w-admin gap-6">
        <Panel title="What the next run would do" description="Counts only. Anonymising and deleting can't be undone." flush>
          <Preview preview={preview} />
        </Panel>

        <Panel
          title="The schedule"
          description={
            keeping.status === "verified" ? (
              <>
                SARS&apos;s record-keeping period: {plural(keeping.years, "year", "years")}, checked on <ExternalLink href={keeping.sourceUrl}>sars.gov.za</ExternalLink> on {formatDateShort(keeping.checkedOn)} (under
                Tax › Rates and dates).
              </>
            ) : (
              keeping.message
            )
          }
          flush
        >
          <ul className="divide-y divide-hairline">
            {schedule.map((row) => (
              <RuleRow key={row.kind} row={row} primary={row.kind === firstToConfirm} />
            ))}
          </ul>
        </Panel>

        <Panel title="What the Act says about keeping records">
          <div className="grid gap-2">
            {retentionPoints.map((point) => (
              <LegalPointText key={point.section} point={point} />
            ))}
            <p className="text-sm text-fg-2">The periods here are yours to decide with your Information Officer and accountant. The privacy notice on the website has a part on how long you keep records: update it to match once you&apos;ve confirmed them.</p>
          </div>
        </Panel>

        <Panel title="Recent runs" flush>
          {runs.length > 0 ? (
            <List label="Recent runs">
              {runs.map((run) => (
                <ListRow key={run.id}>
                  <span className="block font-medium text-ink">
                    {day(run.ranAt)} at {formatTime(run.ranAt, businessTimeZone)}
                  </span>
                  <span className="block text-sm text-fg-2">
                    {plural(run.guestsAnonymised, "guest record", "guest records")} anonymised, {plural(run.photosDeleted, "task photo", "task photos")} deleted.
                  </span>
                  {run.skipped.map((reason) => (
                    <span key={reason} className="block text-sm text-fg-2">
                      Skipped: {reason}
                    </span>
                  ))}
                </ListRow>
              ))}
            </List>
          ) : (
            <p className="px-4 py-3 text-sm text-fg-2 lg:px-5">The daily job hasn&apos;t run the schedule yet.</p>
          )}
        </Panel>
      </div>
    </>
  );
}
