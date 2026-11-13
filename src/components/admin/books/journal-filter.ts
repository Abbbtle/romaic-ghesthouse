import { isIsoDate, type IsoDate } from "@/lib/format/zoned-time";

/** The journals list's filter, from its address: dates either side and an account. Anything unreadable is left out. */
export type JournalQuery = { from: IsoDate | null; until: IsoDate | null; account: string | null };

const first = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value);
const dayOf = (value: unknown): IsoDate | null => {
  const text = first(value);
  return isIsoDate(text) ? text : null;
};

export function journalQueryFrom(params: Record<string, unknown>, knownCodes: ReadonlySet<string>): JournalQuery {
  let from = dayOf(params.from);
  let until = dayOf(params.until);
  if (from && until && from > until) [from, until] = [until, from];
  const account = first(params.account);
  return { from, until, account: typeof account === "string" && knownCodes.has(account) ? account : null };
}

export function isFiltered(query: JournalQuery): boolean {
  return query.from !== null || query.until !== null || query.account !== null;
}
