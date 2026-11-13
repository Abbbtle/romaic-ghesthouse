import "server-only";
import { zonedToday } from "@/lib/format/zoned-time";
import type { MoneyFacts } from "@/lib/ledger/ports";
import type { Database } from "./database";
import { createPostgresMoneyStore } from "./money-store";
import { createPostgresReservationStore } from "./reservation-store";

/**
 * What the ledger reads of bookings and their money, from the reservations
 * and money tables: the booking with its check-out day (in the business's
 * time zone) and any invoiced extras, its payments, and which bookings
 * changed lately for the daily catch-up.
 */
export function createPostgresMoneyFacts(db: Database, timeZone: string): MoneyFacts {
  const reservations = createPostgresReservationStore(db);
  const money = createPostgresMoneyStore(db);
  return {
    async booking(id) {
      const booking = await reservations.booking(id);
      if (!booking) return null;
      const invoices = await money.invoices(id);
      // The latest invoice that stands: its lines after the first (the stay) are extras.
      const latest = [...invoices].reverse().find((invoice) => invoice.status === "issued");
      const extrasCents = latest ? latest.lines.slice(1).reduce((sum, line) => sum + line.amountCents, 0) : 0;
      return {
        id: booking.id,
        ref: booking.ref,
        channel: booking.channel,
        status: booking.status,
        totalCents: booking.totalCents,
        checkedOutOn: booking.status === "checked-out" && booking.checkedOutAt ? zonedToday(booking.checkedOutAt, timeZone) : null,
        extrasCents,
      };
    },
    payments: (bookingId) => money.payments(bookingId),
    async bookingsTouchedSince(since) {
      const rows = await db.all<{ id: string }>(
        `select booking_id as id from app.payments where created_at >= :since or voided_at >= :since
         union select id from app.bookings where checked_out_at >= :since`,
        { since },
      );
      return rows.map((row) => row.id);
    },
  };
}
