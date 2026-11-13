import { addDays, addMonths, isIsoDate, type IsoDate } from "@/lib/format/zoned-time";

/** The expenses list's filter, from the address: dates, a supplier and an account. */
export type ExpenseQuery = { from: IsoDate | null; until: IsoDate | null; supplier: string | null; account: string | null; dated: boolean };

type Params = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) => (typeof value === "string" ? value.trim() : "");

/** The first and last days of the month `date` falls in. */
export function monthOf(date: IsoDate): { from: IsoDate; until: IsoDate } {
  const from = `${date.slice(0, 7)}-01`;
  return { from, until: addDays(addMonths(from, 1), -1) };
}

/**
 * The filter in the address, keeping only values that can be: real dates
 * (in order), a supplier and an account that exist. With no dates given,
 * this month; "all" for every date.
 */
export function expenseQueryFrom(params: Params, today: IsoDate, suppliers: ReadonlySet<string>, accounts: ReadonlySet<string>): ExpenseQuery {
  const supplier = suppliers.has(one(params.supplier)) ? one(params.supplier) : null;
  const account = accounts.has(one(params.account)) ? one(params.account) : null;
  if (one(params.dates) === "all") return { from: null, until: null, supplier, account, dated: false };
  let from = isIsoDate(one(params.from)) ? one(params.from) : null;
  let until = isIsoDate(one(params.until)) ? one(params.until) : null;
  if (!from && !until) ({ from, until } = monthOf(today));
  if (from && until && from > until) [from, until] = [until, from];
  return { from, until, supplier, account, dated: true };
}

/** Whether the list shows something other than this month's expenses for everyone and everything. */
export function isFiltered(query: ExpenseQuery, today: IsoDate): boolean {
  const month = monthOf(today);
  return query.supplier !== null || query.account !== null || !query.dated || query.from !== month.from || query.until !== month.until;
}
