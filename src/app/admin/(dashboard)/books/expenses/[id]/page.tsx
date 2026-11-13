import { FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { journalPath } from "@/components/admin/books/journal-list";
import { ExpenseActions } from "@/components/admin/expenses/expense-actions";
import { expensesPath } from "@/components/admin/expenses/expense-list";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { StatusPill } from "@/components/admin/status-pill";
import { cx } from "@/components/ui/cx";
import { Notice } from "@/components/ui/notice";
import { formatDateShort, formatDayLong } from "@/lib/format/date-time";
import { formatCents } from "@/lib/format/money";
import { businessTimeZone, zonedToday } from "@/lib/format/zoned-time";
import { privateFileMaxBytes } from "@/lib/media/private-files";
import { requireDashboardActor } from "@/server/admin-session";
import { expenseService } from "@/server/bookkeeping";
import { addReceipt, retryExpensePosting, voidExpense } from "../actions";

export const metadata: Metadata = { title: "Expense" };

/** What a page opened after a change says, by the address's notice (never text from the address itself). */
const notices: Record<string, { tone: "success" | "warning"; text: string }> = {
  recorded: { tone: "success", text: "Expense recorded and posted to the books." },
  "not-posted": { tone: "warning", text: "Expense recorded, but it couldn't be posted to the books yet. Try Post to the books below." },
  "receipt-failed": { tone: "warning", text: "Expense recorded, but its receipt couldn't be kept. Add it again below." },
};

function Line({ label, children, strong = false }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3 lg:px-5">
      <dt className={strong ? "font-bold text-ink" : "text-fg-2"}>{label}</dt>
      <dd className={cx("min-w-0 text-right break-words", strong ? "text-h4 font-bold text-ink tabular-nums" : "text-ink")} data-numeric={strong || undefined}>
        {children}
      </dd>
    </div>
  );
}

/**
 * One expense (Pattern: detail): what was paid, to whom, for what and how,
 * its receipt, and its journal in the books. A voided one stays, crossed
 * out, with the reason. The owner's alone (expenses:manage).
 */
export default async function ExpensePage({ params, searchParams }: PageProps<"/admin/books/expenses/[id]">) {
  const actor = await requireDashboardActor({ permission: "expenses:manage" });
  const { id } = await params;
  const { notice } = await searchParams;
  const detail = await expenseService().expense(actor, id);
  if (!detail) notFound();
  const { expense, journal, voidJournal } = detail;
  const voided = expense.voidedAt !== null;
  const shown = typeof notice === "string" ? notices[notice] : undefined;

  return (
    <>
      <PageHeader
        title={expense.supplierName}
        description={
          <span className={cx("flex flex-wrap items-center gap-x-2 gap-y-1", voided && "text-fg-3")}>
            <span className={cx("font-bold tabular-nums", voided ? "line-through" : "text-ink")}>{formatCents(expense.amountCents)}</span>
            <span>
              {expense.accountName}, {formatDateShort(expense.date)}
            </span>
            {voided && <StatusPill>Voided</StatusPill>}
          </span>
        }
        back={{ href: expensesPath, label: "Expenses" }}
      />
      <div className="grid max-w-admin gap-5">
        {shown && <Notice tone={shown.tone}>{shown.text}</Notice>}
        {voided && (
          <Notice tone="info" title={`Voided on ${formatDateShort(zonedToday(expense.voidedAt!, businessTimeZone))}`}>
            {expense.voidReason}. It stays on record; its journal is reversed in the books.
          </Notice>
        )}

        <div className="max-w-xl rounded-md border border-hairline bg-white">
          <dl className={cx("divide-y divide-hairline", voided && "text-fg-3")}>
            <Line label="Amount" strong>
              <span className={voided ? "line-through" : undefined}>{formatCents(expense.amountCents)}</span>
            </Line>
            <Line label="Paid on">{formatDayLong(expense.date)}</Line>
            <Line label="Paid to">{expense.supplierName}</Line>
            <Line label="What it was for">{expense.accountName}</Line>
            <Line label="What it was">{expense.description}</Line>
            <Line label="How it was paid">{expense.paidFromName}</Line>
            <Line label="Receipt">
              {expense.receiptFileId ? (
                <a href={`/admin/files/${expense.receiptFileId}`} className="inline-flex min-h-11 items-center gap-2 font-bold text-link underline underline-offset-4">
                  <FileText aria-hidden="true" strokeWidth={1.75} className="size-4" />
                  Download receipt
                </a>
              ) : (
                <span className="text-fg-3">None yet</span>
              )}
            </Line>
          </dl>
        </div>

        <ExpenseActions
          expenseId={expense.id}
          subject={`the ${formatCents(expense.amountCents)} expense to ${expense.supplierName}`}
          canAddReceipt={!voided && !expense.receiptFileId}
          notPosted={!expense.posted}
          canVoid={!voided}
          receiptMaxBytes={privateFileMaxBytes}
          actions={{ voidExpense, addReceipt, retryPosting: retryExpensePosting }}
        />

        <Panel title="In the books" description="The journal recording it and, once voided, the one reversing it." flush>
          <ul className="divide-y divide-hairline">
            {journal ? (
              <li>
                <Link href={journalPath(journal.id)} className="flex min-h-12 items-center justify-between gap-3 px-4 py-3 -outline-offset-2 hover:bg-chalk lg:px-5">
                  <span className="min-w-0 break-words text-ink">{journal.memo}</span>
                  <span className="shrink-0 text-sm text-fg-2">{formatDateShort(journal.date)}</span>
                </Link>
              </li>
            ) : (
              <li className="px-4 py-3 text-sm text-fg-2 lg:px-5">Not posted yet.</li>
            )}
            {voidJournal && (
              <li>
                <Link href={journalPath(voidJournal.id)} className="flex min-h-12 items-center justify-between gap-3 px-4 py-3 -outline-offset-2 hover:bg-chalk lg:px-5">
                  <span className="min-w-0 break-words text-ink">{voidJournal.memo}</span>
                  <span className="shrink-0 text-sm text-fg-2">{formatDateShort(voidJournal.date)}</span>
                </Link>
              </li>
            )}
          </ul>
        </Panel>
      </div>
    </>
  );
}
