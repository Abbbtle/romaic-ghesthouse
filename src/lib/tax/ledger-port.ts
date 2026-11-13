import type { LedgerService } from "@/lib/ledger/ledger-service";
import type { TaxLedger } from "./ports";

/**
 * The ledger as tax uses it, over the ledger service: the chart and settings
 * read with the actor's own ledger:view, locks with their periods:lock,
 * payroll posted on their behalf, and figures and a period's journals read
 * without a ledger permission (the tax service has already checked
 * tax:manage).
 */
export function taxLedgerFrom(ledger: LedgerService): TaxLedger {
  return {
    accounts: (actor) => ledger.chart(actor),
    sums: (range) => ledger.sumsFor(range),
    settings: async (actor) => {
      const { yearEndMonth, mainBank } = await ledger.settings(actor);
      return { yearEndMonth, mainBank };
    },
    isLocked: (period) => ledger.periodLocked(period),
    lockPeriod: (actor, period) => ledger.lockPeriod(actor, period),
    post: (draft, actor) => ledger.postSystem(draft, { by: actor }),
    journal: async (actor, id) => (await ledger.journal(actor, id))?.journal ?? null,

    journals: (_actor, range) => ledger.journalsFor(range),
  };
}
