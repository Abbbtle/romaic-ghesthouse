import "server-only";
import type { BookingCreation, ChangeOutcome, ChannelStayOutcome, CreateOutcome, ReservationStore } from "@/lib/reservations/ports";
import { bookingStatuses, type Booking, type BookingStatus, type BookingWithGuest, type ChannelStay, type Guest } from "@/lib/reservations/reservations";
import type { Database, SqlTransaction } from "./database";
import { UniqueViolationError } from "./errors";
import { insertBlock, isOverlap } from "./inventory-store";
import { isUuid } from "./uuid";

type GuestRow = { id: string; name: string; phone: string | null; email: string | null; notes: string | null; created_at: Date; updated_at: Date };

type BookingRow = {
  id: string;
  reference: string;
  guest_id: string;
  channel: string;
  status: string;
  apartment: string;
  unit_id: string;
  arrive: string;
  leave: string;
  adults: number;
  children: number;
  total_cents: string | number;
  deposit_due_cents: string | number;
  service_notes: string | null;
  notes: string | null;
  external_ref: string | null;
  request_id: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  revision: number;
  checked_in_at: Date | null;
  checked_out_at: Date | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
};

type JoinedRow = BookingRow & { g_name: string; g_phone: string | null; g_email: string | null; g_notes: string | null; g_created_at: Date; g_updated_at: Date };

const bookingColumns = `b.id, b.reference, b.guest_id, b.channel, b.status, b.apartment, b.unit_id, b.arrive, b.leave, b.adults, b.children,
  b.total_cents, b.deposit_due_cents, b.service_notes, b.notes, b.external_ref, b.request_id, b.created_by, b.created_at, b.updated_at,
  b.revision, b.checked_in_at, b.checked_out_at, b.cancelled_at, b.cancel_reason`;

const joined = `select ${bookingColumns}, g.name as g_name, g.phone as g_phone, g.email as g_email, g.notes as g_notes,
  g.created_at as g_created_at, g.updated_at as g_updated_at
  from app.bookings b join app.guests g on g.id = b.guest_id`;

const isStatus = (value: string): value is BookingStatus => (bookingStatuses as readonly string[]).includes(value);

function bookingOf(row: BookingRow): Booking {
  return {
    id: row.id,
    ref: row.reference,
    guestId: row.guest_id,
    channel: row.channel,
    // The check constraint allows only the known statuses; anything else reads as cancelled, holding nothing.
    status: isStatus(row.status) ? row.status : "cancelled",
    apartment: row.apartment,
    unitId: row.unit_id,
    stay: { arrive: row.arrive, leave: row.leave },
    adults: row.adults,
    children: row.children,
    totalCents: Number(row.total_cents),
    depositDueCents: Number(row.deposit_due_cents),
    serviceNotes: row.service_notes,
    notes: row.notes,
    externalRef: row.external_ref,
    requestId: row.request_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
    checkedInAt: row.checked_in_at,
    checkedOutAt: row.checked_out_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
  };
}

const guestOf = (row: GuestRow): Guest => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  email: row.email,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const withGuestOf = (row: JoinedRow): BookingWithGuest => ({
  ...bookingOf(row),
  guest: { id: row.guest_id, name: row.g_name, phone: row.g_phone, email: row.g_email, notes: row.g_notes, createdAt: row.g_created_at, updatedAt: row.g_updated_at },
});

/** Escapes LIKE's wildcards in a search typed by someone, so "%" finds a percent sign. */
const likePattern = (query: string) => `%${query.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;

function bookingParams(booking: Booking) {
  return {
    id: booking.id,
    reference: booking.ref,
    guestId: booking.guestId,
    channel: booking.channel,
    status: booking.status,
    apartment: booking.apartment,
    unitId: booking.unitId,
    arrive: booking.stay.arrive,
    leave: booking.stay.leave,
    adults: booking.adults,
    children: booking.children,
    totalCents: booking.totalCents,
    depositDueCents: booking.depositDueCents,
    serviceNotes: booking.serviceNotes,
    notes: booking.notes,
    externalRef: booking.externalRef,
    requestId: booking.requestId,
    createdBy: booking.createdBy,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
    revision: booking.revision,
  };
}

/** Inserts the guest (if new), the booking and its block. Throws on a clash, which rolls the caller's transaction back. */
async function insertBooking(tx: SqlTransaction, { newGuest, booking, block }: BookingCreation): Promise<CreateOutcome> {
  if (newGuest) {
    await tx.run(
      `insert into app.guests (id, name, phone, email, notes, created_at, updated_at)
       values (:id, :name, :phone, :email, :notes, :createdAt, :updatedAt)`,
      { id: newGuest.id, name: newGuest.name, phone: newGuest.phone, email: newGuest.email, notes: newGuest.notes, createdAt: newGuest.createdAt, updatedAt: newGuest.updatedAt },
    );
  } else if (!(await tx.get<{ id: string }>("select id from app.guests where id = :id", { id: booking.guestId }))) {
    return { status: "guest-missing" };
  }
  await tx.run(
    `insert into app.bookings (id, reference, guest_id, channel, status, apartment, unit_id, arrive, leave, adults, children, total_cents,
       deposit_due_cents, service_notes, notes, external_ref, request_id, created_by, created_at, updated_at, revision)
     values (:id, :reference, :guestId, :channel, :status, :apartment, :unitId, :arrive::date, :leave::date, :adults, :children, :totalCents,
       :depositDueCents, :serviceNotes, :notes, :externalRef, :requestId, :createdBy, :createdAt, :updatedAt, :revision)`,
    bookingParams(booking),
  );
  if ((await insertBlock(tx, block)) === "unit-unavailable") return { status: "unit-unavailable" };
  return { status: "created" };
}

/** A refused write's outcome, from the error that rolled its transaction back; anything else is rethrown. */
function refusalOf(error: unknown): CreateOutcome {
  if (isOverlap(error)) return { status: "overlaps" };
  if (error instanceof UniqueViolationError && error.constraint === "bookings_reference_unique") return { status: "ref-taken" };
  throw error;
}

/** A transaction that ends early with `outcome` when a step refuses, rolling back what came before. */
class Refusal extends Error {
  constructor(readonly outcome: CreateOutcome | ChangeOutcome) {
    super("refused");
  }
}

/** Bookings and guests in Postgres (./migrations/200-guests.ts, 210-bookings.ts), each write one transaction with its unit's block. */
export function createPostgresReservationStore(db: Database): ReservationStore {
  async function created<Outcome extends { status: string }>(work: (tx: SqlTransaction) => Promise<CreateOutcome | Outcome>): Promise<CreateOutcome | Outcome> {
    try {
      return await db.transaction(async (tx) => {
        const outcome = await work(tx);
        if (outcome.status !== "created") throw new Refusal(outcome as CreateOutcome);
        return outcome;
      });
    } catch (error) {
      if (error instanceof Refusal) return error.outcome as CreateOutcome | Outcome;
      return refusalOf(error);
    }
  }

  return {
    async booking(id) {
      if (!isUuid(id)) return null;
      const row = await db.get<JoinedRow>(`${joined} where b.id = :id`, { id });
      return row ? withGuestOf(row) : null;
    },

    async bookingsOverlapping(range) {
      const rows = await db.all<JoinedRow>(
        `${joined} where daterange(b.arrive, b.leave, '[)') && daterange(:arrive::date, :leave::date, '[)') order by b.arrive, b.created_at`,
        { arrive: range.arrive, leave: range.leave },
      );
      return rows.map(withGuestOf);
    },

    async bookingsAround(day) {
      const rows = await db.all<JoinedRow>(
        `${joined} where b.status in ('confirmed', 'checked-in') and b.arrive <= :day::date and b.leave >= :day::date order by b.arrive, b.created_at`,
        { day },
      );
      return rows.map(withGuestOf);
    },

    async search(query, limit) {
      const rows = await db.all<JoinedRow>(
        `${joined} where b.reference ilike :pattern or g.name ilike :pattern or g.phone ilike :pattern or g.email ilike :pattern
         order by b.created_at desc limit :limit`,
        { pattern: likePattern(query), limit },
      );
      return rows.map(withGuestOf);
    },

    async guest(id) {
      if (!isUuid(id)) return null;
      const row = await db.get<GuestRow>("select id, name, phone, email, notes, created_at, updated_at from app.guests where id = :id", { id });
      return row ? guestOf(row) : null;
    },

    async searchGuests(query, limit) {
      const rows = await db.all<GuestRow>(
        `select id, name, phone, email, notes, created_at, updated_at from app.guests
         where name ilike :pattern or phone ilike :pattern or email ilike :pattern order by lower(name) limit :limit`,
        { pattern: likePattern(query), limit },
      );
      return rows.map(guestOf);
    },

    async bookingsForGuest(guestId) {
      if (!isUuid(guestId)) return [];
      const rows = await db.all<BookingRow>(`select ${bookingColumns} from app.bookings b where b.guest_id = :guestId order by b.arrive desc`, { guestId });
      return rows.map(bookingOf);
    },

    async updateGuest(guest) {
      if (!isUuid(guest.id)) return false;
      // An anonymised guest stays anonymised (migration 400): their details can't be filled in again.
      const { changes } = await db.run("update app.guests set name = :name, phone = :phone, email = :email, notes = :notes, updated_at = :updatedAt where id = :id and anonymised_at is null", {
        id: guest.id,
        name: guest.name,
        phone: guest.phone,
        email: guest.email,
        notes: guest.notes,
        updatedAt: guest.updatedAt,
      });
      return changes === 1;
    },

    async create(creation) {
      if (!isUuid(creation.booking.unitId)) return { status: "unit-unavailable" };
      return (await created((tx) => insertBooking(tx, creation))) as CreateOutcome;
    },

    async convertRequest(conversion) {
      if (!isUuid(conversion.requestId) || !isUuid(conversion.booking.unitId)) return { status: "request-changed" };
      return created(async (tx) => {
        const waiting = await tx.get<{ id: string }>(
          "select id from app.booking_requests where id = :id and status = 'waiting' and arrive >= :today::date for update",
          { id: conversion.requestId, today: conversion.today },
        );
        if (!waiting) return { status: "request-changed" };
        const outcome = await insertBooking(tx, conversion);
        if (outcome.status !== "created") return outcome;
        await tx.run("update app.booking_requests set status = 'accepted', decided_at = :at, decided_by = :by, booking_id = :bookingId where id = :id", {
          id: conversion.requestId,
          at: conversion.at,
          by: conversion.by,
          bookingId: conversion.booking.id,
        });
        return outcome;
      });
    },

    async channelStay(id) {
      if (!isUuid(id)) return null;
      const row = await db.get<{ id: string; unit_id: string; channel: string; arrive: string; leave: string; status: ChannelStay["status"]; booking_id: string | null }>(
        `select e.id, c.unit_id, c.channel, e.arrive, e.leave, e.status, e.booking_id
         from app.channel_events e join app.channel_calendars c on c.id = e.calendar_id where e.id = :id`,
        { id },
      );
      return row ? { id: row.id, unitId: row.unit_id, channel: row.channel, stay: { arrive: row.arrive, leave: row.leave }, status: row.status, bookingId: row.booking_id } : null;
    },

    async channelStaysToBook(from, limit) {
      const rows = await db.all<{ id: string; unit_id: string; channel: string; arrive: string; leave: string; status: ChannelStay["status"]; booking_id: string | null }>(
        `select e.id, c.unit_id, c.channel, e.arrive, e.leave, e.status, e.booking_id
         from app.channel_events e join app.channel_calendars c on c.id = e.calendar_id
         where e.status in ('placeholder', 'conflict') and e.booking_id is null and e.leave > :from::date
         order by e.arrive, e.id limit :limit`,
        { from, limit },
      );
      return rows.map((row) => ({ id: row.id, unitId: row.unit_id, channel: row.channel, stay: { arrive: row.arrive, leave: row.leave }, status: row.status, bookingId: row.booking_id }));
    },

    async convertChannelStay(conversion): Promise<ChannelStayOutcome> {
      if (!isUuid(conversion.channelStayId) || !isUuid(conversion.booking.unitId)) return { status: "stay-changed" };
      return created<ChannelStayOutcome>(async (tx) => {
        const open = await tx.get<{ id: string }>(
          "select id from app.channel_events where id = :id and status in ('placeholder', 'conflict') and booking_id is null for update",
          { id: conversion.channelStayId },
        );
        if (!open) return { status: "stay-changed" };
        await tx.run("delete from app.availability_blocks where channel_event_id = :id", { id: conversion.channelStayId });
        const outcome = await insertBooking(tx, conversion);
        if (outcome.status !== "created") return outcome;
        await tx.run("update app.channel_events set status = 'linked', booking_id = :bookingId, note = null where id = :id", {
          id: conversion.channelStayId,
          bookingId: conversion.booking.id,
        });
        return outcome;
      });
    },

    async change({ booking, expectedRevision }): Promise<ChangeOutcome> {
      if (!isUuid(booking.id) || !isUuid(booking.unitId)) return { status: "missing" };
      try {
        return await db.transaction(async (tx) => {
          const current = await tx.get<{ revision: number }>("select revision from app.bookings where id = :id for update", { id: booking.id });
          if (!current) throw new Refusal({ status: "missing" });
          if (current.revision !== expectedRevision) throw new Refusal({ status: "stale" });
          const unit = await tx.get<{ id: string }>("select id from app.units where id = :unitId and active", { unitId: booking.unitId });
          if (!unit) throw new Refusal({ status: "unit-unavailable" });
          await tx.run(
            "update app.availability_blocks set unit_id = :unitId, arrive = :arrive::date, leave = :leave::date where booking_id = :id",
            { id: booking.id, unitId: booking.unitId, arrive: booking.stay.arrive, leave: booking.stay.leave },
          );
          await tx.run(
            `update app.bookings set channel = :channel, apartment = :apartment, unit_id = :unitId, arrive = :arrive::date, leave = :leave::date,
               adults = :adults, children = :children, total_cents = :totalCents, deposit_due_cents = :depositDueCents,
               service_notes = :serviceNotes, notes = :notes, external_ref = :externalRef, updated_at = :updatedAt, revision = :revision
             where id = :id`,
            bookingParams(booking),
          );
          return { status: "changed" } as const;
        });
      } catch (error) {
        if (error instanceof Refusal) return error.outcome as ChangeOutcome;
        if (isOverlap(error)) return { status: "overlaps" };
        throw error;
      }
    },

    async setStatus(change) {
      if (!isUuid(change.bookingId)) return false;
      return db.transaction(async (tx) => {
        const { changes } = await tx.run(
          `update app.bookings set status = :to, updated_at = :at, revision = revision + 1,
             checked_in_at = case when :to = 'checked-in' then :at else checked_in_at end,
             checked_out_at = case when :to = 'checked-out' then :at else checked_out_at end,
             cancelled_at = case when :to in ('cancelled', 'no-show') then :at else cancelled_at end,
             cancel_reason = case when :to = 'cancelled' then :reason else cancel_reason end,
             leave = coalesce(:leaveOn::date, leave)
           where id = :id and status = any(:from::text[])`,
          { id: change.bookingId, to: change.to, at: change.at, reason: change.cancelReason ?? null, from: `{${change.from.join(",")}}`, leaveOn: change.leaveOn ?? null },
        );
        if (changes !== 1) return false;
        if (change.leaveOn) await tx.run("update app.availability_blocks set leave = :leaveOn::date where booking_id = :id", { id: change.bookingId, leaveOn: change.leaveOn });
        if (change.releaseNights) await tx.run("delete from app.availability_blocks where booking_id = :id", { id: change.bookingId });
        // A cancelled booking lets go of the channel stay it was made from: if the channel still lists it, the next sync holds its nights again.
        if (change.to === "cancelled") await tx.run("delete from app.channel_events where booking_id = :id", { id: change.bookingId });
        return true;
      });
    },
  };
}
