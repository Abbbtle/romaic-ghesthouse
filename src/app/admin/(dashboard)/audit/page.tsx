import type { Metadata } from "next";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { StatusPill } from "@/components/admin/status-pill";
import { capitalised, whenLabel } from "@/components/admin/when-label";
import { can } from "@/lib/accounts/access";
import { parseBeforeSeq } from "@/lib/accounts/audit-log-service";
import { businessTimeZone } from "@/lib/format/zoned-time";
import { roleNames } from "@/lib/kernel/actor";
import type { AuditCategory } from "@/lib/kernel/audit";
import { auditLogService } from "@/server/audit";
import { requireDashboardActor } from "@/server/admin-session";
import { clock } from "@/server/infrastructure";

export const metadata: Metadata = { title: "Activity" };

const categoryNames: Record<AuditCategory, string> = {
  auth: "Sign-in",
  team: "Team",
  content: "Website",
  media: "Photos",
  settings: "Settings",
  contact: "Contact details",
  integrations: "Integrations",
  security: "Security",
  tasks: "Tasks",
  bookings: "Bookings",
  guests: "Guests",
  money: "Money",
  channels: "Channels",
  tax: "Tax",
  periods: "Periods",
  privacy: "Privacy",
};

/**
 * Who did what, newest first: the audit log, filtered to what the reader's
 * permissions let them see (src/lib/accounts/audit-log-service.ts). The log
 * can't be edited or deleted from anywhere. Whoever may read all of it (the
 * owner) also sees whether its hash chain is intact.
 */
export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const actor = await requireDashboardActor({ permission: "audit:view" });
  const beforeSeq = parseBeforeSeq((await searchParams).before);
  const log = auditLogService();
  const [{ entries, olderBeforeSeq }, chain] = await Promise.all([log.page(actor, beforeSeq), can(actor, "audit:view-all") ? log.verifyChain(actor) : null]);
  const now = clock.now();

  return (
    <>
      <PageHeader title="Activity" description="Changes made in the dashboard, newest first. Nobody can edit or delete this record." />
      <div className="grid max-w-admin gap-4">
        {chain && (
          <p role="status" className="flex flex-wrap items-center gap-2 text-sm text-fg-2">
            {chain.status === "intact" ? (
              <>
                <StatusPill tone="success">Record intact</StatusPill> All {chain.entries} entries check out.
              </>
            ) : (
              <>
                <StatusPill tone="danger">Record changed</StatusPill> Entry {chain.atSeq} doesn&apos;t match the record before it. Contact Weberu.
              </>
            )}
          </p>
        )}
        {entries.length === 0 ? (
          beforeSeq === undefined ? (
            <EmptyState title="Nothing yet">Changes to the website, settings and team will be listed here.</EmptyState>
          ) : (
            <EmptyState title="Nothing older">That&apos;s the start of the record.</EmptyState>
          )
        ) : (
          <ol className="grid gap-2" aria-label="Activity">
            {entries.map((entry) => (
              <li key={entry.id} className="rounded-sm border border-hairline bg-white p-3">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <StatusPill>{categoryNames[entry.category]}</StatusPill>
                  <span className="font-medium text-fg">{entry.summary}</span>
                </p>
                <p className="mt-1 text-sm text-fg-3">
                  {entry.actorName ? `${entry.actorName}${entry.actorRole ? ` (${roleNames[entry.actorRole]})` : ""}` : "The system"} ·{" "}
                  {capitalised(whenLabel(entry.at, now, businessTimeZone))}
                </p>
              </li>
            ))}
          </ol>
        )}
        {(olderBeforeSeq !== null || beforeSeq !== undefined) && (
          <nav aria-label="More activity" className="flex flex-wrap gap-6">
            {beforeSeq !== undefined && (
              <a href="?" className="inline-flex min-h-11 items-center text-sm font-medium text-fg underline underline-offset-4">
                Newest activity
              </a>
            )}
            {olderBeforeSeq !== null && (
              <a href={`?before=${olderBeforeSeq}`} className="inline-flex min-h-11 items-center text-sm font-medium text-fg underline underline-offset-4">
                Older activity
              </a>
            )}
          </nav>
        )}
      </div>
    </>
  );
}
