import type { Metadata } from "next";
import { AddAccountSheet } from "@/components/admin/bank/add-account-sheet";
import { balanceWords } from "@/components/admin/bank/bank-labels";
import { bankAccountPath } from "@/components/admin/bank/bank-paths";
import { booksTabsAllowed } from "@/components/admin/books/books-access";
import { BooksTabs } from "@/components/admin/books/books-tabs";
import { EmptyState } from "@/components/admin/empty-state";
import { List, ListRow } from "@/components/admin/list";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { StatusPill } from "@/components/admin/status-pill";
import { maskedNumber } from "@/lib/bookkeeping/bank";
import type { BankAccountView } from "@/lib/bookkeeping/bank-service";
import { formatDayShort } from "@/lib/format/date-time";
import { requireDashboardActor } from "@/server/admin-session";
import { bankService } from "@/server/bookkeeping";
import { addBankAccount } from "./actions";

export const metadata: Metadata = { title: "Bank" };

/** One account's state in a few words: every line matched or not, and whether the statement and the books agree. */
function accountState(account: BankAccountView): { label: string; tone: "success" | "warning" | "neutral" } {
  const { reconciliation } = account;
  if (reconciliation.lineCount === 0) return { label: "No statement yet", tone: "neutral" };
  if (reconciliation.toReconcile > 0) return { label: `${reconciliation.toReconcile} not matched yet`, tone: "warning" };
  if (reconciliation.differenceCents !== null && reconciliation.differenceCents !== 0) return { label: "Doesn't match the books", tone: "warning" };
  return { label: "All matched", tone: "success" };
}

/**
 * The owner's bank accounts (Pattern: list): one row each with whether its
 * statement lines are all matched and how its balance compares with the
 * books. Each opens the account's statement lines. The owner's alone
 * (bank:manage).
 */
export default async function BankPage() {
  const actor = await requireDashboardActor({ permission: "bank:manage" });
  const accounts = await bankService().accounts(actor);

  return (
    <>
      <PageHeader
        title="Bank"
        description="Your bank accounts and their statements, matched line by line with the books. No bank is connected: you import statements yourself."
        actions={<AddAccountSheet action={addBankAccount} />}
      />
      <BooksTabs current="bank" allowed={booksTabsAllowed(actor)} />
      <div className="max-w-admin">
        {accounts.length > 0 ? (
          <Panel flush>
            <List label="Bank accounts">
              {accounts.map((account) => {
                const state = accountState(account);
                const { statement, books } = account.reconciliation;
                return (
                  <ListRow key={account.id} href={bankAccountPath(account.id)}>
                    <span className="grid gap-0.5">
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0 font-bold break-words text-ink">
                          {account.name} <span className="font-normal text-fg-2">· {account.bankName} {maskedNumber(account.accountNumberLast4)}</span>
                        </span>
                        <StatusPill tone={state.tone}>{state.label}</StatusPill>
                      </span>
                      <span className="flex justify-between gap-3 text-sm text-fg-2">
                        <span>{statement ? `Statement on ${formatDayShort(statement.date)}` : "In the books today"}</span>
                        <span className="shrink-0 whitespace-nowrap tabular-nums" data-numeric>
                          {balanceWords(statement ? statement.balanceCents : books.balanceCents)}
                        </span>
                      </span>
                    </span>
                  </ListRow>
                );
              })}
            </List>
          </Panel>
        ) : (
          <EmptyState title="No bank accounts yet" actions={<AddAccountSheet action={addBankAccount} variant="secondary" />}>
            Add the account the business uses, then import its statement from your online banking to match each line with the books.
          </EmptyState>
        )}
      </div>
    </>
  );
}
