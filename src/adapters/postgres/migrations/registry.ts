import type { Migration } from "../migrate";
import { coreMigration } from "./001-core";
import { accountsMigration } from "./010-accounts";
import { mfaMigration } from "./020-mfa";
import { accountTokensMigration } from "./030-account-tokens";
import { auditLogMigration } from "./040-audit-log";
import { mediaMigration } from "./050-media";
import { contentMigration } from "./060-content";
import { inventoryMigration } from "./110-inventory";
import { bookingRequestsMigration } from "./120-booking-requests";
import { guestsMigration } from "./200-guests";
import { bookingsMigration } from "./210-bookings";
import { ratesMigration } from "./220-rates";
import { tasksMigration } from "./240-tasks";
import { channelsMigration } from "./250-channels";
import { moneyMigration } from "./260-money";
import { ledgerMigration } from "./300-ledger";
import { periodsMigration } from "./310-periods";
import { expensesMigration } from "./320-expenses";
import { bankMigration } from "./330-bank";
import { taxParametersMigration } from "./340-tax-parameters";
import { taxReturnsMigration } from "./350-tax-returns";
import { payrollMigration } from "./360-payroll";

export type { Migration } from "../migrate";

/**
 * Every schema migration, in the order they apply (see ../migrate.ts): the
 * site runs the pending ones once per process before its first statement,
 * and `npm run db:migrate` runs them before a deploy. Each is applied once
 * per database and recorded in app.schema_migrations by its id.
 *
 * Numbers come in blocks per phase (docs/planning/build-plan.md): 0xx for
 * the Phase 1 foundation, 1xx for Phase 2, 2xx for Phase 3, 3xx for Phase 4,
 * 4xx for Phase 5. Adding a module's migration:
 *
 * 1. Write it in its own file here, named after its id, exporting one
 *    Migration:
 *
 *      // ./040-diary.ts
 *      import type { Migration } from "../migrate";
 *      export const diaryMigration: Migration = {
 *        id: "040-diary",
 *        sql: `create table app.diary_entries (…); …; select app.secure_schema();`,
 *      };
 *
 * 2. Import it above and add it to the array below, keeping the array in id
 *    order (three digits, then words): checkMigrationOrder refuses the list
 *    otherwise, before any SQL runs, and a test runs it on every `npm test`.
 *    The three wave-2 ids above are reserved and none has shipped, so each
 *    goes in its place whichever module finishes first. Any later change
 *    takes the next number after the last id, whichever module it belongs
 *    to ("060-diary-reminders"), and goes at the end, so a fresh database
 *    and one that's been live for months apply migrations in the same order.
 *
 * 3. Every store test opens a database with the whole registry applied (see
 *    ../testing/test-databases.ts), so the new tables are there for them; the
 *    platform's contract tests then check that every app table has row level
 *    security on and that Supabase's API roles can't reach it.
 *
 * Rules for a migration:
 * - Never edit one once it has shipped: add a new one.
 * - It must also work with the previous release's code. On Vercel, requests
 *   still running on the last deployment, and any rollback, use the database
 *   the new one migrated. So add tables and columns first, and rename or
 *   remove them only once no deployment uses them (expand, then contract).
 * - Put every table in schema app, name the constraints stores look for
 *   (stores recognise UniqueViolationError and ExclusionViolationError from
 *   ../errors.ts by constraint name), and end with
 *   `select app.secure_schema();` (see ./001-core.ts).
 * - Store instants as timestamptz and calendar dates as date. Never cast a
 *   timestamptz to date or time without an explicit AT TIME ZONE: sessions
 *   run in UTC (sessionTimeZone in ../driver.ts), but Supabase's pooler can't
 *   promise it, and the business day is Johannesburg's anyway.
 * - It runs inside one transaction with the others, so nothing that can't
 *   (such as CREATE INDEX CONCURRENTLY), and it must not depend on roles
 *   that only exist on Supabase: guard such parts with a DO block that checks
 *   first, as app.secure_schema() does.
 */
export const migrations: readonly Migration[] = [
  coreMigration,
  accountsMigration,
  mfaMigration,
  accountTokensMigration,
  auditLogMigration,
  mediaMigration,
  contentMigration,
  inventoryMigration,
  bookingRequestsMigration,
  guestsMigration,
  bookingsMigration,
  ratesMigration,
  tasksMigration,
  channelsMigration,
  moneyMigration,
  ledgerMigration,
  periodsMigration,
  expensesMigration,
  bankMigration,
  taxParametersMigration,
  taxReturnsMigration,
  payrollMigration,
];
