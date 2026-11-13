import type { ExpenseView } from "@/lib/bookkeeping/expense-service";
import { formatDateShort, formatDayShort } from "@/lib/format/date-time";
import { formatCents } from "@/lib/format/money";
import type { IsoDate } from "@/lib/format/zoned-time";
import { cx } from "@/components/ui/cx";
import { adminRoutes } from "../admin-routes";
import { List, ListRow } from "../list";
import { StatusPill } from "../status-pill";

export const expensesPath = `${adminRoutes.books}/expenses`;

export function expensePath(id: string): string {
  return `${expensesPath}/${encodeURIComponent(id)}`;
}

/** A day in a list: "Thu 12 Nov" this year, "12 Nov 2025" before it. */
export function dayLabel(date: IsoDate, today: IsoDate): string {
  return date.slice(0, 4) === today.slice(0, 4) ? formatDayShort(date) : formatDateShort(date);
}

/**
 * Expenses as a list, newest first, each row opening the expense. Fixed
 * lines so a phone reads them the same each time: who and what for (with
 * its state when it isn't plain), then the day and what it was, with the
 * amount on the right. A voided expense is crossed out.
 */
export function ExpenseList({ expenses, today }: { expenses: readonly ExpenseView[]; today: IsoDate }) {
  return (
    <List label="Expenses">
      {expenses.map((expense) => {
        const voided = expense.voidedAt !== null;
        return (
          <ListRow key={expense.id} href={expensePath(expense.id)}>
            <span className={cx("grid gap-0.5", voided && "text-fg-3")}>
              <span className="flex items-start justify-between gap-3">
                <span className={cx("min-w-0 font-bold break-words", voided ? "line-through" : "text-ink")}>
                  {expense.supplierName} <span className="font-normal text-fg-2">· {expense.accountName}</span>
                </span>
                {voided ? <StatusPill>Voided</StatusPill> : !expense.posted ? <StatusPill tone="warning">Not in the books yet</StatusPill> : null}
              </span>
              <span className="flex justify-between gap-3 text-sm text-fg-2">
                <span className="min-w-0 truncate">
                  {dayLabel(expense.date, today)} · {expense.description}
                </span>
                <span className={cx("shrink-0 tabular-nums", voided && "line-through")} data-numeric>
                  {formatCents(expense.amountCents)}
                </span>
              </span>
            </span>
          </ListRow>
        );
      })}
    </List>
  );
}
