/**
 * The advisory locks the Postgres adapter takes, kept in one place so two
 * uses never share a number by accident. Every one is transaction-scoped
 * (pg_advisory_xact_lock): it's released when the transaction ends, and it
 * works through Supabase's transaction pooler, which doesn't keep the
 * session-level kind. Take a lock first in a transaction, before any row
 * locks, so two transactions never each hold what the other waits for.
 *
 * A lock can also be taken per record with the two-number form,
 * pg_advisory_xact_lock(:lock::int4, hashtext(:key)), when only writes about
 * the same thing (one phone number, say) must wait for each other; the
 * numbers below fit in an int4 for that.
 *
 * Never change a number once it has shipped: during a deploy, old and new
 * servers run side by side, and they only wait for each other while they
 * take the same lock.
 */
export const advisoryLocks = {
  /** Everyone migrating takes it, so servers starting together migrate one after another. */
  migrations: 740_261_001,
  /**
   * Changes to who's on the team take it, so two servers can't both create
   * the first owner, and two owners demoting each other at once can't leave
   * the team without one.
   */
  team: 740_261_002,
  /** Appending to the audit log, so each entry chains onto exactly one previous entry. */
  audit: 740_261_003,
  /** Reserved for stay requests and bookings (Phases 2 and 3). */
  booking: 740_261_004,
} as const;
