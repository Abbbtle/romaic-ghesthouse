import "server-only";
import { accountServices, reencryptStoredSecrets } from "./accounts";
import { pruneRateLimits, reportError } from "./infrastructure";
import { syncAllCalendars } from "./channels";
import { bookingService } from "./stays";
import { catchUpLedger } from "./ledger";
import { runPrivacyRetention } from "./privacy";
import { generateHousekeeping } from "./tasks";

/**
 * The daily job (/api/cron/daily) and how its tasks run: each in turn, so
 * one that fails doesn't stop the others. A failure is reported for the logs
 * (by whoever's `report` is: it must leave personal data out) and only
 * marked "failed" in the summary, which is what the caller answers with.
 */

/** Named tasks, run in the order they're listed. Each resolves with a small JSON-friendly report. */
export type MaintenanceTasks = Readonly<Record<string, () => Promise<unknown>>>;

export type TaskOutcome = { status: "done"; result: unknown } | { status: "failed" };

export type MaintenanceSummary = {
  /** Every task finished. */
  ok: boolean;
  /** Each task's outcome, by name, in the order they ran. */
  tasks: Record<string, TaskOutcome>;
};

export async function runMaintenanceTasks(tasks: MaintenanceTasks, report: (description: string, error: unknown) => void): Promise<MaintenanceSummary> {
  const outcomes: Record<string, TaskOutcome> = {};
  for (const [name, task] of Object.entries(tasks)) {
    try {
      outcomes[name] = { status: "done", result: await task() };
    } catch (error) {
      report(`The daily task "${name}" failed`, error);
      outcomes[name] = { status: "failed" };
    }
  }
  return { ok: Object.values(outcomes).every((outcome) => outcome.status === "done"), tasks: outcomes };
}

/**
 * The daily job (/api/cron/daily). Every task is idempotent, so running it
 * twice, or after a missed day, only finds less (or more) to do:
 * - expiredSessions: deletes dashboard sessions past their idle or absolute limit;
 * - expiredLinks: deletes password-reset and email-verification links that expired;
 * - rateLimitWindows: forgets rate-limit windows that have ended;
 * - storedSecrets: moves authenticator secrets onto DATA_ENCRYPTION_KEY's
 *   newest key after a rotation ("remaining" counts any still on an older one);
 * - bookingRequests: expires requests still waiting on their arrival day,
 *   deletes handled ones past their retention period, and forgets visitor
 *   keys after 24 hours (src/lib/booking/retention.ts).
 * - channelCalendars: imports every channel's calendar (src/server/channels.ts);
 * - housekeepingTasks: adds the clean for today's departures (src/server/tasks.ts);
 * - ledgerCatchUp: posts any booking whose money or check-out changed in the
 *   last week and isn't in the books yet (src/server/ledger.ts).
 * - privacyRetention: applies the retention rules the owner has confirmed:
 *   anonymises inactive guest records and deletes old task photos, counts
 *   only in its report (src/server/privacy.ts, src/lib/privacy/retention.ts).
 */
export function runDailyMaintenance(): Promise<MaintenanceSummary> {
  const services = accountServices();
  return runMaintenanceTasks(
    {
      expiredSessions: () => services.accounts.pruneExpiredSessions(),
      expiredLinks: () => services.emailLinks.pruneExpiredLinks(),
      rateLimitWindows: () => pruneRateLimits(),
      storedSecrets: () => reencryptStoredSecrets(),
      bookingRequests: () => bookingService().maintenance.housekeeping(),
      channelCalendars: () => syncAllCalendars(),
      housekeepingTasks: () => generateHousekeeping(),
      ledgerCatchUp: () => catchUpLedger(),
      privacyRetention: () => runPrivacyRetention(),
    },
    reportError,
  );
}
