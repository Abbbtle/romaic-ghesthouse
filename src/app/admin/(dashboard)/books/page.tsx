import type { Metadata } from "next";
import Link from "next/link";
import { balanceWords } from "@/components/admin/bank/bank-labels";
import { booksTabsAllowed } from "@/components/admin/books/books-access";
import { BooksTabs } from "@/components/admin/books/books-tabs";
import { JournalList, journalsPath } from "@/components/admin/books/journal-list";
import { reversedAmong } from "@/components/admin/books/journal-reads";
import { LedgerLine, LedgerList } from "@/components/admin/books/ledger-lines";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { formatDateShort, formatMonth } from "@/lib/format/date-time";
import { formatCents } from "@/lib/format/money";
import { isCashAccount, systemAccounts } from "@/lib/ledger/accounts";
import type { ProfitAndLoss, TrialBalance } from "@/lib/ledger/reports";
import { requireDashboardActor } from "@/server/admin-session";
import { ledgerService } from "@/server/ledger";

export const metadata: Metadata = { title: "Books" };

/** Income, expenses and what's left, as a short ledger. */
function ProfitLines({ report }: { report: ProfitAndLoss }) {
  return (
    <LedgerList>
      <LedgerLine label="Income" value={formatCents(report.incomeCents)} />
      <LedgerLine label="Expenses" value={formatCents(report.expenseCents)} />
      <LedgerLine label={report.profitCents < 0 ? "Loss" : "Profit"} value={formatCents(Math.abs(report.profitCents))} strong />
    </LedgerList>
  );
}

/** Each account's balance on its usual side (a debit balance for what's owned, a credit balance for what's owed), from the trial balance. */
function balancesOf(trial: TrialBalance) {
  const debitBalance = new Map(trial.rows.map((row) => [row.code, row.debitCents - row.creditCents]));
  const sum = (matches: (code: string) => boolean) => [...debitBalance].filter(([code]) => matches(code)).reduce((total, [, cents]) => total + cents, 0);
  return {
    bank: sum((code) => isCashAccount(code) && code !== systemAccounts.cashOnHand && code !== systemAccounts.gatewayClearing),
    cash: debitBalance.get(systemAccounts.cashOnHand) ?? 0,
    gateway: debitBalance.get(systemAccounts.gatewayClearing) ?? 0,
    channels: sum((code) => code.startsWith("11")),
    guests: debitBalance.get(systemAccounts.guestReceivables) ?? 0,
    deposits: -(debitBalance.get(systemAccounts.guestDeposits) ?? 0),
  };
}

/**
 * The books at a glance, for the owner (Pattern: dashboard, kept to short
 * ledgers rather than number tiles): this month and the financial year so
 * far, the balances that matter day to day (each said plainly, with the
 * accountant's name for it beneath), and the latest journals.
 */
export default async function BooksPage() {
  const actor = await requireDashboardActor({ permission: "ledger:view" });
  const ledger = ledgerService();
  const today = ledger.today();
  const year = await ledger.financialYear(actor, today);
  const [month, yearSoFar, trial, latest] = await Promise.all([
    ledger.profitAndLoss(actor, { from: `${today.slice(0, 7)}-01`, until: today }),
    ledger.profitAndLoss(actor, { from: year.start, until: today }),
    ledger.trialBalance(actor, today),
    ledger.journals(actor, { limit: 6 }),
  ]);
  const reversed = await reversedAmong(ledger, actor, latest);
  const balances = balancesOf(trial);

  return (
    <>
      <PageHeader title="Books" description="Money in and out, and what the guesthouse owns and owes, kept from its bookings and payments." />
      <BooksTabs current="overview" allowed={booksTabsAllowed(actor)} />
      <div className="grid max-w-admin gap-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title={formatMonth(today.slice(0, 7))} description="So far this month" flush>
            <ProfitLines report={month} />
          </Panel>
          <Panel title="This financial year" description={`From ${formatDateShort(year.start)}`} flush>
            <ProfitLines report={yearSoFar} />
          </Panel>
        </div>
        <p className="max-w-[62ch] text-sm text-fg-2">
          Income is counted on the day a guest checks out, not when they pay; until then, what they&apos;ve paid is held as a guest deposit. That&apos;s the
          default until your accountant decides otherwise.
        </p>

        <Panel title="Balances today" flush>
          <LedgerList>
            <LedgerLine label="In the bank" value={balanceWords(balances.bank)} />
            <LedgerLine label="Cash on hand" value={formatCents(balances.cash)} />
            <LedgerLine label="Paid online, not yet in the bank" note="Payment gateway clearing" value={formatCents(balances.gateway)} />
            <LedgerLine label="Owed by booking sites" note="Channel receivables" value={formatCents(balances.channels)} />
            <LedgerLine label="Still owed by guests who've checked out" note="Guest receivables" value={formatCents(balances.guests)} />
            <LedgerLine label="Paid by guests who haven't checked out yet" note="Guest deposits held" value={formatCents(balances.deposits)} />
          </LedgerList>
        </Panel>

        {latest.length > 0 ? (
          <Panel
            title="Latest journals"
            flush
            actions={
              <Link href={journalsPath} className="inline-flex min-h-11 items-center text-sm font-bold text-link underline underline-offset-4">
                All journals
              </Link>
            }
          >
            <JournalList journals={latest} reversed={reversed} today={today} label="Latest journals" />
          </Panel>
        ) : (
          <EmptyState title="No journals yet">Payments and check-outs post here by themselves, as they happen. Manual journals, like the owner paying money in, go under Journals.</EmptyState>
        )}
      </div>
    </>
  );
}
