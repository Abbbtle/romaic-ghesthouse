import type { Metadata } from "next";
import { accountGroups } from "@/components/admin/books/account-groups";
import { journalsPath } from "@/components/admin/books/journal-list";
import { ManualJournalForm } from "@/components/admin/books/manual-journal-form";
import { PageHeader } from "@/components/admin/page-header";
import { requireDashboardActor } from "@/server/admin-session";
import { ids } from "@/server/infrastructure";
import { ledgerService } from "@/server/ledger";
import { postJournal } from "../../actions";

export const metadata: Metadata = { title: "New journal" };

/**
 * A journal typed in by hand (Pattern: form), for what payments and
 * check-outs don't post by themselves: the owner paying money in or taking
 * it out, depreciation, a correction. Only switched-on accounts can be
 * chosen, and months that are locked can't be posted in. For whoever may
 * post (ledger:post: the owner).
 */
export default async function NewJournalPage() {
  const actor = await requireDashboardActor({ permission: "ledger:post" });
  const ledger = ledgerService();
  const [chart, periods] = await Promise.all([ledger.chart(actor), ledger.periods(actor)]);

  return (
    <>
      <PageHeader
        title="New journal"
        description="For what the books don't post by themselves, such as the owner paying money in, depreciation or a correction."
        back={{ href: journalsPath, label: "Journals" }}
      />
      <ManualJournalForm
        action={postJournal}
        groups={accountGroups(chart, { activeOnly: true })}
        today={ledger.today()}
        idempotencyKey={ids.newId()}
        lockedPeriods={periods.filter((period) => period.status === "locked").map((period) => period.period)}
      />
    </>
  );
}
