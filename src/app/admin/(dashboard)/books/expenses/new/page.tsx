import type { Metadata } from "next";
import { adminRoutes } from "@/components/admin/admin-routes";
import { ExpenseForm, type ExpensePrefill } from "@/components/admin/expenses/expense-form";
import { expensesPath } from "@/components/admin/expenses/expense-list";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { can } from "@/lib/accounts/access";
import { maskedNumber } from "@/lib/bookkeeping/bank";
import { formatDateShort } from "@/lib/format/date-time";
import { centsForInput, formatCents } from "@/lib/format/money";
import { privateFileMaxBytes } from "@/lib/media/private-files";
import { requireDashboardActor } from "@/server/admin-session";
import { bankService, expenseService } from "@/server/bookkeeping";
import { recordExpense } from "../actions";

export const metadata: Metadata = { title: "Record an expense" };

/**
 * A new expense (Pattern: form). Opened from a statement line
 * (?bankLine=<id>), the line's day, amount, description and bank account
 * come filled in, and the line is matched once the expense is posted. The
 * owner's alone (expenses:manage; the line also needs bank:manage).
 */
export default async function NewExpensePage({ searchParams }: PageProps<"/admin/books/expenses/new">) {
  const actor = await requireDashboardActor({ permission: "expenses:manage" });
  const { bankLine } = await searchParams;
  const [options, fromLine] = await Promise.all([
    expenseService().options(actor),
    typeof bankLine === "string" && can(actor, "bank:manage") ? bankService().lineForExpense(actor, bankLine) : Promise.resolve(null),
  ]);
  const prefill: ExpensePrefill | undefined = fromLine
    ? {
        date: fromLine.line.date,
        amount: centsForInput(-fromLine.line.amountCents),
        description: fromLine.line.description.slice(0, 200),
        bankAccountId: fromLine.account.id,
        bankLineId: fromLine.line.id,
        lineLabel: `${formatCents(-fromLine.line.amountCents)} out of ${fromLine.account.name} ${maskedNumber(fromLine.account.accountNumberLast4)} on ${formatDateShort(fromLine.line.date)}: ${fromLine.line.description}`,
      }
    : undefined;
  const back = fromLine ? { href: `${adminRoutes.books}/bank/${fromLine.account.id}/lines/${fromLine.line.id}`, label: "Statement line" } : { href: expensesPath, label: "Expenses" };

  return (
    <>
      <PageHeader title="Record an expense" description="It's posted to the books as it's saved. A mistake can be voided later; nothing is deleted." back={back} />
      <div className="max-w-admin">
        <Panel>
          <ExpenseForm
            action={recordExpense}
            options={{
              today: options.today,
              accounts: options.accounts,
              suppliers: options.suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name })),
              bankAccounts: options.bankAccounts.map((account) => ({ id: account.id, label: account.label })),
              channels: options.channels,
            }}
            receiptMaxBytes={privateFileMaxBytes}
            prefill={prefill}
          />
        </Panel>
      </div>
    </>
  );
}
