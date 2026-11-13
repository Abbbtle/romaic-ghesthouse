import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { balanceWords, lineStatusNames, lineStatusTones } from "@/components/admin/bank/bank-labels";
import { bankAccountPath } from "@/components/admin/bank/bank-paths";
import { LineReconcile, type SuggestionRow } from "@/components/admin/bank/line-reconcile";
import { journalPath } from "@/components/admin/books/journal-list";
import { expensesPath } from "@/components/admin/expenses/expense-list";
import { PageHeader } from "@/components/admin/page-header";
import { StatusPill } from "@/components/admin/status-pill";
import { Notice } from "@/components/ui/notice";
import { can } from "@/lib/accounts/access";
import { maskedNumber } from "@/lib/bookkeeping/bank";
import { formatDateShort, formatDayLong, formatDayShort } from "@/lib/format/date-time";
import { formatCents } from "@/lib/format/money";
import { journalAmount } from "@/lib/ledger/journals";
import { requireDashboardActor } from "@/server/admin-session";
import { bankService } from "@/server/bookkeeping";
import { makeLineJournal, matchLine, unmatchLine } from "../../../actions";

export const metadata: Metadata = { title: "Statement line" };

const notices: Record<string, { tone: "success" | "warning"; text: string }> = {
  "expense-matched": { tone: "success", text: "Expense recorded, posted to the books and matched to this line." },
  "expense-not-matched": { tone: "warning", text: "Expense recorded, but it doesn't match this line (a different amount, account or day), so the line isn't matched yet." },
};

function apart(days: number, before: boolean): string {
  if (days === 0) return "the same day";
  return `${days} ${days === 1 ? "day" : "days"} ${before ? "before" : "after"}`;
}

/**
 * One statement line (Pattern: detail): what the bank called it as the
 * heading, then what the bank says (money in or out first, in words, never
 * a minus), and matching it with the books, or what it's matched to. The
 * owner's alone (bank:manage).
 */
export default async function BankLinePage({ params, searchParams }: PageProps<"/admin/books/bank/[id]/lines/[lineId]">) {
  const actor = await requireDashboardActor({ permission: "bank:manage" });
  const { id, lineId } = await params;
  const { notice } = await searchParams;
  const detail = await bankService().line(actor, lineId);
  if (!detail || detail.account.id !== id) notFound();
  const { line, account, matched, suggestions, choices, locked } = detail;
  const moneyIn = line.amountCents > 0;
  const shown = typeof notice === "string" ? notices[notice] : undefined;
  const suggestionRows: SuggestionRow[] = suggestions.map(({ journal, daysApart }) => ({
    journalId: journal.id,
    memo: journal.memo,
    when: `${formatDayShort(journal.date)}, ${apart(daysApart, journal.date < line.date)}`,
    amount: formatCents(journalAmount(journal)),
    href: journalPath(journal.id),
  }));

  return (
    <>
      <PageHeader
        title={line.description}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {/* The phone's title bar cuts a long description short, so it's written out in full here too. */}
            <span className="font-bold break-words text-ink lg:hidden">{line.description}</span>
            <StatusPill tone={lineStatusTones[line.status]}>{lineStatusNames[line.status]}</StatusPill>
          </span>
        }
        back={{ href: bankAccountPath(account.id), label: account.name }}
      />
      <div className="grid max-w-admin gap-5">
        {shown && <Notice tone={shown.tone}>{shown.text}</Notice>}
        {line.status === "reversed" && matched && (
          <Notice tone="warning" title="Its journal was reversed">
            It was matched to &ldquo;{matched.memo}&rdquo;, which has since been reversed (an expense voided, say). Match the line again.
          </Notice>
        )}

        <div className="max-w-xl rounded-md border border-hairline bg-white">
          <dl className="divide-y divide-hairline">
            <div className="flex items-baseline justify-between gap-4 px-4 py-3 lg:px-5">
              <dt className="font-bold text-ink">{moneyIn ? "Money in" : "Money out"}</dt>
              <dd className="text-h4 font-bold text-ink tabular-nums" data-numeric>
                {formatCents(Math.abs(line.amountCents))}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 px-4 py-3 lg:px-5">
              <dt className="text-fg-2">On</dt>
              <dd className="text-right text-ink">{formatDayLong(line.date)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 px-4 py-3 lg:px-5">
              <dt className="text-fg-2">Account</dt>
              <dd className="min-w-0 text-right break-words text-ink">
                {account.name} {maskedNumber(account.accountNumberLast4)}
              </dd>
            </div>
            {line.balanceCents !== null && (
              <div className="flex items-baseline justify-between gap-4 px-4 py-3 lg:px-5">
                <dt className="text-fg-2">Balance after it</dt>
                <dd className="text-right text-ink tabular-nums" data-numeric>
                  {balanceWords(line.balanceCents)}
                </dd>
              </div>
            )}
          </dl>
        </div>

        <LineReconcile
          lineId={line.id}
          moneyIn={moneyIn}
          matched={
            line.status === "matched" && matched && line.match
              ? { memo: matched.memo, when: `${formatDateShort(matched.date)} · ${formatCents(journalAmount(matched))}`, href: journalPath(matched.id), made: line.match.kind === "created" }
              : null
          }
          suggestions={suggestionRows}
          choices={choices}
          expenseHref={!moneyIn && can(actor, "expenses:manage") ? `${expensesPath}/new?bankLine=${encodeURIComponent(line.id)}` : null}
          locked={locked}
          actions={{ match: matchLine, make: makeLineJournal, unmatch: unmatchLine }}
        />
      </div>
    </>
  );
}
