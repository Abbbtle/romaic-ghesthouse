import type { LedgerService } from "@/lib/ledger/ledger-service";
import type { LedgerStore } from "@/lib/ledger/ports";
import type { BooksLedger } from "./ports";

/**
 * The ledger as bookkeeping uses it, from the ledger service (posting, the
 * chart, locked months) and its store (reading journals, which the
 * service only offers behind ledger:view). Bookkeeping checks its own
 * permissions before it calls any of these.
 */
export function booksLedgerOf(service: LedgerService, store: Pick<LedgerStore, "accounts" | "journal" | "reversalOf" | "journals">): BooksLedger {
  return {
    today: () => service.today(),
    postSystem: (draft, posting) => service.postSystem(draft, posting),
    periodLocked: (period) => service.periodLocked(period),
    activeAccounts: () => service.activeAccounts(),
    chartAccounts: async () => (await store.accounts()).sort((a, b) => a.code.localeCompare(b.code)),
    addSystemAccount: (account) => service.addSystemAccount(account),
    sumsFor: (range) => service.sumsFor(range),
    journal: (id) => store.journal(id),
    reversalOf: (id) => store.reversalOf(id),
    journals: (filter) => store.journals(filter),
  };
}
