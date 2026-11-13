import "server-only";
import { createPostgresLedgerStore } from "@/adapters/postgres/ledger-store";
import { createPostgresMoneyFacts } from "@/adapters/postgres/ledger-facts";
import { assertCan, can } from "@/lib/accounts/access";
import { businessTimeZone } from "@/lib/format/zoned-time";
import { createLedgerService, type LedgerService } from "@/lib/ledger/ledger-service";
import { auditRecorder } from "./audit";
import { clock, database, ids, reportError } from "./infrastructure";

/**
 * The ledger as the site uses it: journals in Postgres, bookings and their
 * money read from the reservations and money tables, permissions from the
 * accounts core, changes in the audit log. Bookings' money is posted by
 * syncBookingLedger after each money change and check-out, and again by the
 * daily catch-up in case one of those failed.
 */

let service: LedgerService | null = null;

export function ledgerService(): LedgerService {
  service ??= createLedgerService({
    store: createPostgresLedgerStore(database()),
    facts: createPostgresMoneyFacts(database(), businessTimeZone),
    clock,
    ids,
    audit: auditRecorder(),
    access: { can, assertCan },
    reportProblem: (message) => reportError(message, new Error(message)),
    timeZone: businessTimeZone,
  });
  return service;
}

/**
 * Posts whatever a booking's money still needs. Never throws: the money or
 * check-out it follows is already saved, and the daily catch-up tries again.
 */
export async function syncBookingLedger(bookingId: string): Promise<void> {
  try {
    const { problems } = await ledgerService().sync(bookingId);
    for (const problem of problems) reportError(`The books couldn't post ${problem}`, new Error(problem));
  } catch (error) {
    reportError("The books couldn't post a booking's money; the daily catch-up will try again", error);
  }
}

/** The daily job's step: posts bookings whose money or check-out changed in the last week. */
export function catchUpLedger(): Promise<{ bookings: number; posted: number; problems: number }> {
  return ledgerService().catchUp(7);
}
