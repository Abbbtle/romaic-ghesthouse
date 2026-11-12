import "server-only";
import { systemAccounts } from "@/lib/ledger/accounts";
import { defaultLedgerSettings } from "@/lib/ledger/ports";
import { paymentKinds, paymentMethods, paymentStatuses, type Payment, type PaymentKind, type PaymentMethod, type PaymentStatus } from "@/lib/money/money";
import type { ReportStore } from "@/lib/reports/ports";
import { heldBlockReasons, type HeldBlockReason, type OwingBooking } from "@/lib/reports/reports";
import { bookingStatuses, type BookingStatus } from "@/lib/reservations/reservations";
import type { Database } from "./database";

/** The statuses whose bookings hold their nights (holdsNights in src/lib/reservations), as SQL reads them. */
const holding = "('confirmed', 'checked-in', 'checked-out')";

const oneOf = <T extends string>(values: readonly T[], value: string, fallback: T): T => ((values as readonly string[]).includes(value) ? (value as T) : fallback);

type PaymentRow = {
  id: string;
  booking_id: string;
  kind: string;
  method: string;
  amount_cents: string | number;
  received_on: string;
  reference: string | null;
  status: string;
  receipt_number: string | null;
  provider_ref: string | null;
  idempotency_key: string | null;
  recorded_by: string | null;
  created_at: Date;
  voided_at: Date | null;
  void_reason: string | null;
};

function paymentOf(row: PaymentRow): Payment {
  return {
    id: row.id,
    bookingId: row.booking_id,
    // Check constraints allow only the known values; anything else reads as one that counts for nothing paid.
    kind: oneOf<PaymentKind>(paymentKinds, row.kind, "extra"),
    method: oneOf<PaymentMethod>(paymentMethods, row.method, "cash"),
    amountCents: Number(row.amount_cents),
    receivedOn: row.received_on,
    reference: row.reference,
    status: oneOf<PaymentStatus>(paymentStatuses, row.status, "pending"),
    receiptNumber: row.receipt_number,
    providerRef: row.provider_ref,
    idempotencyKey: row.idempotency_key,
    recordedBy: row.recorded_by,
    createdAt: row.created_at,
    voidedAt: row.voided_at,
    voidReason: row.void_reason,
  };
}

/**
 * What the reports read, in Postgres: plain reads of units, bookings,
 * blocks, tasks, payments and the ledger's commission account. Nothing is
 * summed here that src/lib/reports sums itself, except the prefilter for
 * money still owed, which the money core's own sum then decides.
 */
export function createPostgresReportStore(db: Database): ReportStore {
  return {
    async units() {
      return db.all<{ id: string; apartment: string; active: boolean }>("select id, apartment, active from app.units order by sort, lower(name), id");
    },

    async staysAround(range) {
      const rows = await db.all<{ unit_id: string; status: string; arrive: string; leave: string }>(
        `select unit_id, status, arrive, leave from app.bookings
         where status in ${holding} and arrive <= :until::date and leave >= :from::date
         order by arrive, id`,
        { from: range.from, until: range.until },
      );
      return rows.map((row) => ({ unitId: row.unit_id, status: oneOf<BookingStatus>(bookingStatuses, row.status, "cancelled"), stay: { arrive: row.arrive, leave: row.leave } }));
    },

    async blocksWithin(range) {
      const rows = await db.all<{ unit_id: string; reason: string; arrive: string; leave: string }>(
        `select unit_id, reason, arrive, leave from app.availability_blocks
         where reason in ('owner', 'maintenance', 'channel', 'request') and arrive <= :until::date and leave > :from::date
         order by arrive, id`,
        { from: range.from, until: range.until },
      );
      return rows.map((row) => ({ unitId: row.unit_id, reason: oneOf<HeldBlockReason>(heldBlockReasons, row.reason, "request"), stay: { arrive: row.arrive, leave: row.leave } }));
    },

    async cleansDone(between) {
      const rows = await db.all<{ done_at: Date }>(
        `select done_at from app.tasks
         where kind = 'housekeeping' and status = 'done' and done_at >= :start and done_at < :end
         order by done_at`,
        { start: between.start, end: between.end },
      );
      return rows.map((row) => row.done_at);
    },

    async checkedOut(between) {
      const rows = await db.all<{ id: string; channel: string; arrive: string; leave: string; total_cents: string | number; checked_out_at: Date }>(
        `select id, channel, arrive, leave, total_cents, checked_out_at from app.bookings
         where status = 'checked-out' and checked_out_at >= :start and checked_out_at < :end
         order by checked_out_at, id`,
        { start: between.start, end: between.end },
      );
      return rows.map((row) => ({
        bookingId: row.id,
        channel: row.channel,
        stay: { arrive: row.arrive, leave: row.leave },
        totalCents: Number(row.total_cents),
        checkedOutAt: row.checked_out_at,
      }));
    },

    async commission(range) {
      const rows = await db.all<{ journal_id: string; entry_date: string; cents: string | number; counter_accounts: string[] | null }>(
        `select j.id as journal_id, j.entry_date,
           sum(case when l.account_code = :commission then l.debit_cents - l.credit_cents else 0 end) as cents,
           array_agg(distinct l.account_code) filter (where l.account_code <> :commission) as counter_accounts
         from app.journals j
         join app.journal_lines l on l.journal_id = j.id
         where j.entry_date between :from::date and :until::date
           and exists (select 1 from app.journal_lines c where c.journal_id = j.id and c.account_code = :commission)
         group by j.id, j.entry_date
         order by j.entry_date, j.id`,
        { from: range.from, until: range.until, commission: systemAccounts.otaCommission },
      );
      return rows.map((row) => ({ journalId: row.journal_id, date: row.entry_date, cents: Number(row.cents), counterAccounts: row.counter_accounts ?? [] }));
    },

    async owing() {
      // The prefilter: received payments, less received refunds, not voided (counts() in src/lib/money), short of the total.
      const bookings = await db.all<{
        id: string;
        reference: string;
        status: string;
        arrive: string;
        leave: string;
        channel: string;
        guest_name: string;
        total_cents: string | number;
        deposit_due_cents: string | number;
      }>(
        `with paid as (
           select booking_id, sum(case when kind = 'refund' then -amount_cents else amount_cents end) as cents
           from app.payments where status = 'received' and voided_at is null
           group by booking_id
         )
         select b.id, b.reference, b.status, b.arrive, b.leave, b.channel, g.name as guest_name, b.total_cents, b.deposit_due_cents
         from app.bookings b
         join app.guests g on g.id = b.guest_id
         left join paid p on p.booking_id = b.id
         where b.status in ${holding} and b.total_cents > coalesce(p.cents, 0)
         order by b.arrive, b.reference`,
      );
      if (bookings.length === 0) return [];
      const payments = await db.all<PaymentRow>(
        `select id, booking_id, kind, method, amount_cents, received_on, reference, status, receipt_number, provider_ref, idempotency_key,
           recorded_by, created_at, voided_at, void_reason
         from app.payments where booking_id = any(:ids::uuid[]) order by created_at, id`,
        { ids: `{${bookings.map((booking) => booking.id).join(",")}}` },
      );
      const byBooking = Map.groupBy(payments.map(paymentOf), (payment) => payment.bookingId);
      return bookings.map(
        (row): OwingBooking => ({
          id: row.id,
          ref: row.reference,
          status: oneOf<BookingStatus>(bookingStatuses, row.status, "cancelled"),
          stay: { arrive: row.arrive, leave: row.leave },
          channel: row.channel,
          guestName: row.guest_name,
          totalCents: Number(row.total_cents),
          depositDueCents: Number(row.deposit_due_cents),
          payments: byBooking.get(row.id) ?? [],
        }),
      );
    },

    async channelNames() {
      const rows = await db.all<{ key: string; name: string }>("select key, name from app.channels order by sort, key");
      return Object.fromEntries(rows.map((row) => [row.key, row.name]));
    },

    async yearEndMonth() {
      const row = await db.get<{ year_end_month: number }>("select year_end_month from app.books_settings where id");
      return row?.year_end_month ?? defaultLedgerSettings.yearEndMonth;
    },
  };
}
