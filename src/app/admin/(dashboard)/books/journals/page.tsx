import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { accountGroups } from "@/components/admin/books/account-groups";
import { booksTabsAllowed } from "@/components/admin/books/books-access";
import { BooksTabs } from "@/components/admin/books/books-tabs";
import { isFiltered, journalQueryFrom } from "@/components/admin/books/journal-filter";
import { JournalList, journalsPath } from "@/components/admin/books/journal-list";
import { reversedAmong } from "@/components/admin/books/journal-reads";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { ButtonLink } from "@/components/ui/button";
import { inputClasses, labelClasses, selectClasses } from "@/components/ui/form-controls";
import { can } from "@/lib/accounts/access";
import { formatDateShort } from "@/lib/format/date-time";
import { requireDashboardActor } from "@/server/admin-session";
import { ledgerService } from "@/server/ledger";

export const metadata: Metadata = { title: "Journals" };

const shownAtOnce = 100;

/**
 * Every journal, newest first (Pattern: list), filtered by dates and an
 * account from a plain form, so the filter lives in the address and works
 * before scripts load. Each row opens the journal. For the owner
 * (ledger:view); New journal for whoever may post (ledger:post).
 */
export default async function JournalsPage({ searchParams }: PageProps<"/admin/books/journals">) {
  const actor = await requireDashboardActor({ permission: "ledger:view" });
  const ledger = ledgerService();
  const today = ledger.today();
  const chart = await ledger.chart(actor);
  const query = journalQueryFrom(await searchParams, new Set(chart.map((account) => account.code)));
  const journals = await ledger.journals(actor, { from: query.from ?? undefined, until: query.until ?? undefined, accountCode: query.account ?? undefined, limit: shownAtOnce });
  const reversed = await reversedAmong(ledger, actor, journals);
  const account = chart.find((candidate) => candidate.code === query.account);
  const filtered = isFiltered(query);
  const span = [query.from && `from ${formatDateShort(query.from)}`, query.until && `until ${formatDateShort(query.until)}`].filter(Boolean).join(" ");

  return (
    <>
      <PageHeader
        title="Journals"
        description="Every entry in the books, newest first: those posted by payments and check-outs, and those typed in by hand."
        actions={
          can(actor, "ledger:post") ? (
            <ButtonLink href={`${journalsPath}/new`} size="sm" icon={<Plus aria-hidden="true" strokeWidth={2} className="size-4" />}>
              New journal
            </ButtonLink>
          ) : undefined
        }
      />
      <BooksTabs current="journals" allowed={booksTabsAllowed(actor)} />
      <div className="grid max-w-admin gap-5">
        <form action={journalsPath} aria-label="Filter journals" className="grid gap-4 rounded-md border border-hairline bg-white p-4 sm:grid-cols-2 lg:grid-cols-[10rem_10rem_minmax(0,1fr)_auto] lg:items-end lg:p-5">
          <div>
            <label htmlFor="journals-from" className={labelClasses}>
              From
            </label>
            <input id="journals-from" name="from" type="date" defaultValue={query.from ?? undefined} className={inputClasses("compact", "mt-1.5 tabular-nums")} />
          </div>
          <div>
            <label htmlFor="journals-until" className={labelClasses}>
              Until
            </label>
            <input id="journals-until" name="until" type="date" defaultValue={query.until ?? undefined} className={inputClasses("compact", "mt-1.5 tabular-nums")} />
          </div>
          <div className="sm:col-span-2 lg:col-span-1">
            <label htmlFor="journals-account" className={labelClasses}>
              Account
            </label>
            <select id="journals-account" name="account" defaultValue={query.account ?? ""} className={selectClasses("compact", "mt-1.5")}>
              <option value="">All accounts</option>
              {accountGroups(chart, { activeOnly: false }).map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.accounts.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.code} {option.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:col-span-2 lg:col-span-1">
            <button type="submit" className="inline-flex min-h-11 items-center rounded-sm border-[1.5px] border-ink bg-white px-4 text-sm font-bold text-ink hover:bg-chalk">
              Show journals
            </button>
            {filtered && (
              <Link href={journalsPath} className="inline-flex min-h-11 items-center text-sm font-bold text-link underline underline-offset-4">
                Clear
              </Link>
            )}
          </div>
        </form>

        {journals.length > 0 ? (
          <Panel
            title={filtered ? "Matching journals" : "All journals"}
            description={[account && `On ${account.code} ${account.name}`, span].filter(Boolean).join(", ") || undefined}
            flush
          >
            <JournalList journals={journals} reversed={reversed} today={today} label="Journals" />
            {journals.length === shownAtOnce && (
              <p className="border-t border-hairline px-4 py-3 text-sm text-fg-2 lg:px-5">These are the latest {shownAtOnce}. Set an earlier Until date to see older ones.</p>
            )}
          </Panel>
        ) : filtered ? (
          <EmptyState title="No journals match">Try other dates, or all accounts.</EmptyState>
        ) : (
          <EmptyState title="No journals yet">Payments and check-outs post their journals here by themselves. Post one by hand for anything else, like the owner paying money in.</EmptyState>
        )}
      </div>
    </>
  );
}
