import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { booksTabsAllowed } from "@/components/admin/books/books-access";
import { BooksTabs } from "@/components/admin/books/books-tabs";
import { EmptyState } from "@/components/admin/empty-state";
import { expenseQueryFrom, isFiltered, type ExpenseQuery } from "@/components/admin/expenses/expense-filter";
import { ExpenseFilterSheet } from "@/components/admin/expenses/expense-filter-sheet";
import { ExpenseList, expensesPath } from "@/components/admin/expenses/expense-list";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { Button, ButtonLink } from "@/components/ui/button";
import { inputClasses, labelClasses, selectClasses } from "@/components/ui/form-controls";
import { formatDateShort, formatDateSpan } from "@/lib/format/date-time";
import { formatCents } from "@/lib/format/money";
import { requireDashboardActor } from "@/server/admin-session";
import { expenseService } from "@/server/bookkeeping";

export const metadata: Metadata = { title: "Expenses" };

const shownAtOnce = 200;

const linkClasses = "inline-flex min-h-11 items-center text-sm font-bold text-link underline underline-offset-4";

type FilterOptions = { suppliers: readonly { id: string; name: string }[]; accounts: readonly { code: string; name: string }[] };

/** The dates a list covers: "1–30 Nov 2026", "From 1 Nov 2026", "All dates". */
function spanLabel(query: ExpenseQuery): string {
  if (query.from) return query.until ? formatDateSpan(query.from, query.until) : `From ${formatDateShort(query.from)}`;
  return query.until ? `Until ${formatDateShort(query.until)}` : "All dates";
}

/** The filter's fields. `prefix` keeps their ids apart, as the form is drawn twice: in the phone's sheet and inline from 1024 px. */
function FilterFields({ prefix, query, options }: { prefix: string; query: ExpenseQuery; options: FilterOptions }) {
  return (
    <>
      <div>
        <label htmlFor={`${prefix}-from`} className={labelClasses}>
          From
        </label>
        <input id={`${prefix}-from`} name="from" type="date" defaultValue={query.from ?? undefined} className={inputClasses("compact", "mt-1.5 tabular-nums")} />
      </div>
      <div>
        <label htmlFor={`${prefix}-until`} className={labelClasses}>
          Until
        </label>
        <input id={`${prefix}-until`} name="until" type="date" defaultValue={query.until ?? undefined} className={inputClasses("compact", "mt-1.5 tabular-nums")} />
      </div>
      <div>
        <label htmlFor={`${prefix}-supplier`} className={labelClasses}>
          Supplier
        </label>
        <select id={`${prefix}-supplier`} name="supplier" defaultValue={query.supplier ?? ""} className={selectClasses("compact", "mt-1.5")}>
          <option value="">All suppliers</option>
          {options.suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${prefix}-account`} className={labelClasses}>
          What it was for
        </label>
        <select id={`${prefix}-account`} name="account" defaultValue={query.account ?? ""} className={selectClasses("compact", "mt-1.5")}>
          <option value="">Everything</option>
          {options.accounts.map((account) => (
            <option key={account.code} value={account.code}>
              {account.name}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

/** Back to this month from a filtered list, or every date from this month's. */
function OtherDatesLink({ filtered }: { filtered: boolean }) {
  return filtered ? (
    <Link href={expensesPath} className={linkClasses}>
      This month
    </Link>
  ) : (
    <Link href={`${expensesPath}?dates=all`} className={linkClasses}>
      All dates
    </Link>
  );
}

/**
 * What the guesthouse spends (Pattern: list), this month by default,
 * filtered by dates, a supplier and an account from a plain form, so the
 * filter lives in the address and works before scripts load. Below 1024 px
 * the filter is one line saying what's shown, with Change opening the form
 * in a sheet, so the list comes first. Each row opens the expense. The
 * owner's alone (expenses:manage).
 */
export default async function ExpensesPage({ searchParams }: PageProps<"/admin/books/expenses">) {
  const actor = await requireDashboardActor({ permission: "expenses:manage" });
  const service = expenseService();
  const options = await service.options(actor);
  const query = expenseQueryFrom(await searchParams, options.today, new Set(options.suppliers.map((supplier) => supplier.id)), new Set(options.accounts.map((account) => account.code)));
  const { expenses, totalCents } = await service.list(actor, {
    from: query.from ?? undefined,
    until: query.until ?? undefined,
    supplierId: query.supplier ?? undefined,
    accountCode: query.account ?? undefined,
    limit: shownAtOnce,
  });
  const filtered = isFiltered(query, options.today);
  const standing = expenses.filter((expense) => expense.voidedAt === null).length;
  const span = spanLabel(query);
  const supplierName = options.suppliers.find((supplier) => supplier.id === query.supplier)?.name;
  const accountName = options.accounts.find((account) => account.code === query.account)?.name;
  const summary = [span, supplierName ?? "All suppliers", accountName].filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader
        title="Expenses"
        description="What the guesthouse spends, each against a supplier and posted to the books as it's recorded."
        actions={
          <ButtonLink href={`${expensesPath}/new`} size="sm" icon={<Plus aria-hidden="true" strokeWidth={2} className="size-4" />}>
            Record expense
          </ButtonLink>
        }
      />
      <BooksTabs current="expenses" allowed={booksTabsAllowed(actor)} />
      <div className="grid max-w-admin gap-5">
        <ExpenseFilterSheet summary={summary}>
          <form action={expensesPath} aria-label="Filter expenses" className="grid gap-5">
            <FilterFields prefix="sheet-expenses" query={query} options={options} />
            <div className="grid justify-items-start gap-2">
              <Button type="submit" variant="primary" fullWidth>
                Show expenses
              </Button>
              <OtherDatesLink filtered={filtered} />
            </div>
          </form>
        </ExpenseFilterSheet>

        <form
          action={expensesPath}
          aria-label="Filter expenses"
          className="hidden gap-4 rounded-md border border-hairline bg-white p-5 lg:grid lg:grid-cols-[10rem_10rem_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end"
        >
          <FilterFields prefix="expenses" query={query} options={options} />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <button type="submit" className="inline-flex min-h-11 items-center rounded-sm border-[1.5px] border-ink bg-white px-4 text-sm font-bold text-ink hover:bg-chalk">
              Show expenses
            </button>
            <OtherDatesLink filtered={filtered} />
          </div>
        </form>

        {expenses.length > 0 ? (
          <Panel
            title={span}
            description={
              <>
                <span className="tabular-nums" data-numeric>
                  {formatCents(totalCents)}
                </span>{" "}
                over {standing} {standing === 1 ? "expense" : "expenses"}
                {standing < expenses.length ? ", not counting voided ones" : ""}
              </>
            }
            actions={
              <Link href={`${expensesPath}/suppliers`} className="inline-flex min-h-11 items-center text-sm font-bold text-link underline underline-offset-4">
                Suppliers
              </Link>
            }
            flush
          >
            <ExpenseList expenses={expenses} today={options.today} />
            {expenses.length === shownAtOnce && (
              <p className="border-t border-hairline px-4 py-3 text-sm text-fg-2 lg:px-5">These are the latest {shownAtOnce}. Choose an earlier Until date to see older ones.</p>
            )}
          </Panel>
        ) : filtered ? (
          <EmptyState title="No expenses match">Try other dates, or all suppliers and everything they were for.</EmptyState>
        ) : (
          <EmptyState
            title="No expenses this month yet"
            actions={
              <ButtonLink href={`${expensesPath}/new`} variant="secondary" size="sm">
                Record expense
              </ButtonLink>
            }
          >
            Record what you spend as you go, with a photo of the receipt. Each one is posted to the books as it&rsquo;s saved.
          </EmptyState>
        )}
      </div>
    </>
  );
}
