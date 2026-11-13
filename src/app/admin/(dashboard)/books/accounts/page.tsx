import type { Metadata } from "next";
import Link from "next/link";
import { AccountSwitch, AddAccountSheet } from "@/components/admin/books/account-controls";
import { booksTabsAllowed } from "@/components/admin/books/books-access";
import { BooksTabs } from "@/components/admin/books/books-tabs";
import { journalsPath } from "@/components/admin/books/journal-list";
import { PageHeader } from "@/components/admin/page-header";
import { StatusPill } from "@/components/admin/status-pill";
import { can } from "@/lib/accounts/access";
import { formatDateShort } from "@/lib/format/date-time";
import { formatCents } from "@/lib/format/money";
import { accountKindNames, accountKinds, type LedgerAccount } from "@/lib/ledger/accounts";
import { normalBalance } from "@/lib/ledger/reports";
import { requireDashboardActor } from "@/server/admin-session";
import { ledgerService } from "@/server/ledger";
import { addAccount, setAccountActive } from "../actions";

export const metadata: Metadata = { title: "Accounts" };

/**
 * What a row says about an account that's off, in words. One that's on says
 * nothing: the intro says once that the app's own accounts always stay on.
 */
function accountNote(account: LedgerAccount): string | null {
  if (account.active) return null;
  return account.system ? "Kept for automatic postings that aren't in use yet." : "Off: it can't be chosen for new journals.";
}

/**
 * The chart of accounts (Pattern: settings list): each kind's accounts as
 * rows with their balance today. Whoever may post (the owner) adds accounts
 * in a sheet and switches their own on and off as rows, saved as they're
 * flipped; the accounts automatic postings use always stay on, which the
 * intro says once rather than every row.
 */
export default async function AccountsPage() {
  const actor = await requireDashboardActor({ permission: "ledger:view" });
  const ledger = ledgerService();
  const today = ledger.today();
  const [chart, trial] = await Promise.all([ledger.chart(actor), ledger.trialBalance(actor, today)]);
  const sums = new Map(trial.rows.map((row) => [row.code, row]));
  const canPost = can(actor, "ledger:post");

  return (
    <>
      <PageHeader
        title="Accounts"
        description="The chart of accounts: where every rand in the books is kept, with each account's balance today."
        actions={canPost ? <AddAccountSheet action={addAccount} takenCodes={chart.map((account) => account.code)} /> : undefined}
      />
      <BooksTabs current="accounts" allowed={booksTabsAllowed(actor)} />
      <div className="grid max-w-admin gap-8">
        <div className="grid max-w-[62ch] gap-2 text-sm text-fg-2">
          <p>
            Balances are on {formatDateShort(today)}. Income and expense accounts show their totals since the books began. The chart is a draft for your accountant to
            confirm. Open an account to see its journals.
          </p>
          <p>
            Most of these are the app&rsquo;s own accounts: payments, check-outs and expenses post to them by themselves, so they can&rsquo;t be switched off.
            {canPost && " An account you add has a switch, to take it out of use."}
          </p>
        </div>
        {accountKinds.map((kind) => {
          const accounts = chart.filter((account) => account.kind === kind);
          if (accounts.length === 0) return null;
          return (
            <section key={kind} aria-labelledby={`accounts-${kind}`} className="grid gap-3">
              <h2 id={`accounts-${kind}`} className="text-h3 font-bold text-ink">
                {accountKindNames[kind]}
              </h2>
              <ul className="divide-y divide-hairline rounded-md border border-hairline bg-white">
                {accounts.map((account) => {
                  const note = accountNote(account);
                  const sum = sums.get(account.code);
                  return (
                    <li key={account.code} className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 lg:px-5">
                      <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="text-sm text-fg-3 tabular-nums">{account.code}</span>
                        <Link href={`${journalsPath}?account=${account.code}`} className="font-bold break-words text-ink underline-offset-4 hover:underline">
                          {account.name}
                        </Link>
                        {!account.active && <StatusPill>Off</StatusPill>}
                      </p>
                      <span className="text-right whitespace-nowrap text-ink tabular-nums" data-numeric>
                        {formatCents(sum ? normalBalance(account.kind, sum) : 0)}
                      </span>
                      {(note || (canPost && !account.system)) && (
                        <>
                          <p className="text-sm text-fg-3">{note}</p>
                          {canPost && !account.system ? <AccountSwitch code={account.code} name={account.name} active={account.active} action={setAccountActive} /> : <span />}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
