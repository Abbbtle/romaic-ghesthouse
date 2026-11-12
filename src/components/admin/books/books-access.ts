import { can } from "@/lib/accounts/access";
import type { Actor } from "@/lib/kernel/actor";
import type { BooksPage } from "./books-tabs";

/** Which Books tabs someone may open, from their permissions (owner only today). Each page checks its own permission again. */
export function booksTabsAllowed(actor: Pick<Actor, "role">): Record<BooksPage, boolean> {
  const ledger = can(actor, "ledger:view");
  return {
    overview: ledger,
    journals: ledger,
    expenses: can(actor, "expenses:manage"),
    bank: can(actor, "bank:manage"),
    reports: ledger,
    months: ledger,
    accounts: ledger,
  };
}
