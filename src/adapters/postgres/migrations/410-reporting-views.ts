import type { Migration } from "../migrate";

/**
 * What the reports read quickly (see ../report-store.ts and src/lib/reports).
 *
 * No views: the reports' rules (what counts as a night sold or available,
 * how commission is tied to a channel) live in src/lib/reports, where they
 * are tested once for every store, and the store reads plain rows. A view
 * would also run with its owner's rights, past row level security, so who
 * may see money is decided where everything else is: the service checks
 * reports:revenue before any figure is read.
 *
 * One index helps: revenue reads stays by when they checked out. Arrivals,
 * departures and nights already use bookings_by_arrive and bookings_by_leave,
 * cleaning uses tasks_done_by_time, and commission journal_lines_by_account.
 */
export const reportingViewsMigration: Migration = {
  id: "410-reporting-views",
  sql: /* sql */ `
    create index bookings_by_checked_out on app.bookings (checked_out_at) where status = 'checked-out';

    select app.secure_schema();
  `,
};
