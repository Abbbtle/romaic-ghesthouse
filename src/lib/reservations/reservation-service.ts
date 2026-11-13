import { newRequestRef } from "@/lib/booking/reference-codes";
import type { BookingStore, RandomSource } from "@/lib/booking/ports";
import { statusOn } from "@/lib/booking/requests";
import { parseWith } from "@/lib/forms/parse";
import { addDays, zonedToday, type IsoDate } from "@/lib/format/zoned-time";
import type { InventoryStore } from "@/lib/inventory/ports";
import { nightsOf, stayLabel, type Stay } from "@/lib/inventory/stays";
import type { AvailabilityBlock, Unit } from "@/lib/inventory/units";
import type { Actor } from "@/lib/kernel/actor";
import type { AuditRecorder } from "@/lib/kernel/audit";
import type { Clock, IdGenerator } from "@/lib/kernel/ports";
import { done, refused, refusedWith, type ChangeResult } from "@/lib/kernel/result";
import { acceptRequestSchema, bookingChangeSchema, cancelSchema, guestChangeSchema, newBookingSchema } from "./booking-input";
import type { ReservationAccess, ReservationStore } from "./ports";
import { canBookChannelStay, holdsNights, isArrivingOn, isInHouse, isLeavingOn, type Booking, type BookingStatus, type BookingWithGuest, type ChannelStay, type Guest } from "./reservations";

export type ReservationServiceDependencies = {
  store: ReservationStore;
  /** Units (for checks and names) and blocks (for the chart), from the inventory. */
  inventory: Pick<InventoryStore, "units" | "unit" | "blocksOverlapping">;
  /** Booking requests, to accept one into a booking. */
  requests: Pick<BookingStore, "request">;
  /** The price the rates give for a stay, in cents, or null when there's no rate for it (src/lib/rates). */
  quote: (apartment: string, stay: Stay, guests: number) => Promise<number | null>;
  /** The apartment types' names, by slug, from the site's content. */
  apartmentNames: () => Promise<Record<string, string>>;
  /** Told when a guest checks out (the tasks core adds the clean). Failures are reported, never undo the check-out. */
  onCheckedOut?: (booking: Booking) => Promise<void>;
  reportProblem: (message: string) => void;
  random: RandomSource;
  clock: Clock;
  ids: IdGenerator;
  audit: AuditRecorder;
  access: ReservationAccess;
  timeZone: string;
};

/** The longest booking the dashboard takes in one go. */
export const maxBookingNights = 90;

/** What staff see of a stay (roles.md, "Staff's limited view"): the guest's name, the unit, the dates and the service notes. Nothing else. */
export type StaffStay = {
  id: string;
  guestName: string;
  unitName: string;
  stay: Stay;
  status: BookingStatus;
  serviceNotes: string | null;
};

/** A stay on the Today screen for someone who may see bookings: everything, with the unit's and apartment's names. */
export type TodayStay = BookingWithGuest & { unitName: string; apartmentName: string };

export type TodayView<Stay> = { today: IsoDate; arrivals: Stay[]; departures: Stay[]; inHouse: Stay[] };

/** The availability chart: units by night, with what holds each night. */
export type ChartView = {
  from: IsoDate;
  until: IsoDate;
  units: (Unit & { apartmentName: string })[];
  blocks: AvailabilityBlock[];
  /** The bookings behind "booking" blocks, by id: reference, guest's name and status. */
  bookings: Record<string, { ref: string; guestName: string; status: BookingStatus }>;
};

const bookingGone = "This booking was changed or removed. Reload the page.";

const channelStayGone = "This channel stay was already made into a booking, or it's gone from the channel. Reload the page.";

const takenMessage = "That unit is already taken on one of these nights. Choose another unit or other dates.";

/** A booking record from a form's draft, confirmed, at revision 1. */
function bookingFrom({
  id,
  ref,
  guestId,
  unit,
  stay,
  draft,
  by,
  now,
}: {
  id: string;
  ref: string;
  guestId: string;
  unit: Unit;
  stay: Stay;
  draft: { adults: number; children: number; total: number; depositDue: number; serviceNotes: string | null; notes: string | null; externalRef: string | null; channel: string };
  by: string;
  now: Date;
}): Booking {
  return {
    id,
    ref,
    guestId,
    channel: draft.channel,
    status: "confirmed",
    apartment: unit.apartment,
    unitId: unit.id,
    stay,
    adults: draft.adults,
    children: draft.children,
    totalCents: draft.total,
    depositDueCents: draft.depositDue,
    serviceNotes: draft.serviceNotes,
    notes: draft.notes,
    externalRef: draft.externalRef,
    requestId: null,
    createdBy: by,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    checkedInAt: null,
    checkedOutAt: null,
    cancelledAt: null,
    cancelReason: null,
  };
}

/** Bookings and guests, from the dashboard: create, change, cancel, check in and out, and the Today and chart views. */
export function createReservationService(deps: ReservationServiceDependencies) {
  const { store, inventory, clock, ids, audit, access } = deps;
  const today = () => zonedToday(clock.now(), deps.timeZone);

  async function record(actor: Actor, action: string, booking: Pick<Booking, "id" | "ref">, summary: string) {
    await audit.record({ actor, category: "bookings", action, target: { type: "booking", id: booking.id }, summary });
  }

  async function unitFor(unitId: string): Promise<Unit | null> {
    const unit = await inventory.unit(unitId);
    return unit && unit.active ? unit : null;
  }

  function blockFor(booking: Booking, by: string): AvailabilityBlock {
    return {
      id: ids.newId(),
      unitId: booking.unitId,
      stay: booking.stay,
      reason: "booking",
      note: `Booking ${booking.ref}`,
      requestId: null,
      bookingId: booking.id,
      channelEventId: null,
      createdBy: by,
      createdAt: clock.now(),
    };
  }

  /** Stores a new booking, drawing another reference while the one drawn is taken (unless it's a request's own). */
  async function storeNew<Outcome extends { status: string }>(create: (ref: string) => Promise<Outcome>, fixedRef: string | null): Promise<Outcome & { ref?: string }> {
    let ref = fixedRef ?? newRequestRef(deps.random);
    for (let draw = 1; draw <= 5; draw += 1) {
      const outcome = await create(ref);
      if (outcome.status !== "ref-taken" || fixedRef) return { ...outcome, ref };
      ref = newRequestRef(deps.random);
    }
    throw new Error("No unused booking reference after 5 draws.");
  }

  function inventoryProblem(outcome: { status: string }): ChangeResult | null {
    if (outcome.status === "overlaps") return refused({ unitId: takenMessage });
    if (outcome.status === "unit-unavailable") return refused({ unitId: "That unit isn't offered any more. Choose another." });
    return null;
  }

  async function namesOfUnits(): Promise<Map<string, Unit>> {
    return new Map((await inventory.units()).map((unit) => [unit.id, unit]));
  }

  async function setStatus(
    actor: Actor,
    id: string,
    rule: {
      from: readonly BookingStatus[];
      to: BookingStatus;
      release: boolean;
      reason?: string | null;
      when?: (booking: Booking) => string | null;
      leaveOn?: (booking: Booking) => IsoDate | null;
    },
  ): Promise<ChangeResult & { booking?: Booking; endedOn?: IsoDate | null }> {
    const booking = await store.booking(id);
    if (!booking || !rule.from.includes(booking.status)) return refusedWith(bookingGone);
    const problem = rule.when?.(booking);
    if (problem) return refusedWith(problem);
    const leaveOn = rule.leaveOn?.(booking) ?? null;
    const changed = await store.setStatus({ bookingId: id, from: rule.from, to: rule.to, at: clock.now(), releaseNights: rule.release, cancelReason: rule.reason ?? null, leaveOn });
    if (!changed) return refusedWith(bookingGone);
    return { ok: true, booking: leaveOn ? { ...booking, stay: { arrive: booking.stay.arrive, leave: leaveOn } } : booking, endedOn: leaveOn };
  }

  return {
    today,

    /** Bookings with a night between `from` and `until`, arrival order. */
    async list(actor: Actor, range: Stay): Promise<BookingWithGuest[]> {
      access.assertCan(actor, "bookings:view");
      return store.bookingsOverlapping(range);
    },

    async search(actor: Actor, query: string): Promise<BookingWithGuest[]> {
      access.assertCan(actor, "bookings:view");
      const trimmed = query.trim().slice(0, 80);
      return trimmed.length < 2 ? [] : store.search(trimmed, 50);
    },

    async booking(actor: Actor, id: string): Promise<BookingWithGuest | null> {
      access.assertCan(actor, "bookings:view");
      return store.booking(id);
    },

    /** The rates' price for a stay, to prefill a form; null when there's no rate. */
    async suggestedTotal(actor: Actor, apartment: string, stay: Stay, guests: number): Promise<number | null> {
      access.assertCan(actor, "bookings:create");
      return deps.quote(apartment, stay, guests);
    },

    /** A channel stay that can still become a booking, to fill in the new-booking form; null when it can't (or doesn't exist). */
    async channelStay(actor: Actor, id: string): Promise<ChannelStay | null> {
      access.assertCan(actor, "bookings:create");
      const stay = await store.channelStay(id);
      return stay && canBookChannelStay(stay) ? stay : null;
    },

    /** Channel stays from today on that aren't bookings yet, for the Bookings page (at most 50). */
    async channelStaysToBook(actor: Actor): Promise<ChannelStay[]> {
      access.assertCan(actor, "bookings:create");
      return store.channelStaysToBook(today(), 50);
    },

    /** A new booking from the dashboard (phone, walk-in, a channel's booking typed in, or direct), or from a stay imported from a channel's calendar. */
    async create(actor: Actor, input: unknown): Promise<ChangeResult<{ id: string; ref: string }>> {
      access.assertCan(actor, "bookings:create");
      const parsed = parseWith(newBookingSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const draft = parsed.value;
      const stay = { arrive: draft.arrive, leave: draft.leave };
      if (nightsOf(stay) > maxBookingNights) return refused({ leave: `A booking is for at most ${maxBookingNights} nights. Make two for a longer stay.` });
      const unit = await unitFor(draft.unitId);
      if (!unit) return refused({ unitId: "Choose a unit that's offered." });
      const now = clock.now();
      let guest: Guest | null = null;
      if (draft.guestId) {
        guest = await store.guest(draft.guestId);
        if (!guest) return refused({ guestName: "That guest no longer exists. Enter their details instead." });
      }
      const newGuest: Guest | null = guest
        ? null
        : { id: ids.newId(), name: draft.guestName!, phone: draft.guestPhone, email: draft.guestEmail, notes: null, createdAt: now, updatedAt: now };
      const guestId = guest?.id ?? newGuest!.id;
      const id = ids.newId();
      const channelStay = draft.channelStayId ? await store.channelStay(draft.channelStayId) : null;
      if (draft.channelStayId && (!channelStay || !canBookChannelStay(channelStay))) return refusedWith(channelStayGone);
      // A booking made from a channel stay is that channel's, whatever the form said.
      const fromStay = channelStay ? { ...draft, channel: channelStay.channel } : draft;
      const outcome = await storeNew((ref) => {
        const booking = bookingFrom({ id, ref, guestId, unit, stay, draft: fromStay, by: actor.id, now });
        const creation = { newGuest, booking, block: blockFor(booking, actor.id) };
        return channelStay ? store.convertChannelStay({ ...creation, channelStayId: channelStay.id }) : store.create(creation);
      }, null);
      if (outcome.status === "stay-changed") return refusedWith(channelStayGone);
      const problem = inventoryProblem(outcome);
      if (problem) return problem as ChangeResult<{ id: string; ref: string }>;
      if (outcome.status === "guest-missing") return refused({ guestName: "That guest no longer exists. Enter their details instead." });
      const from = channelStay ? `from a ${fromStay.channel} calendar stay` : `(${fromStay.channel})`;
      await record(actor, "booking.created", { id, ref: outcome.ref! }, `Booked ${unit.name} for ${guest?.name ?? newGuest!.name}, ${stayLabel(stay)} ${from}`);
      return done({ id, ref: outcome.ref! });
    },

    /**
     * Accepts a waiting booking request into a booking in the unit chosen,
     * with the agreed price: the guest record (an existing one with the same
     * phone, or a new one), the booking (keeping the request's reference) and
     * its nights, all at once.
     */
    async acceptRequest(actor: Actor, requestId: string, input: unknown): Promise<ChangeResult<{ id: string }>> {
      access.assertCan(actor, "bookings:create");
      const parsed = parseWith(acceptRequestSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const request = await deps.requests.request(requestId);
      if (!request || statusOn(request, today()) !== "waiting") return refusedWith("This request was already handled, or it has expired. Reload the page.");
      const unit = await unitFor(parsed.value.unitId);
      if (!unit || unit.apartment !== request.apartment) return refused({ unitId: "Choose a unit of the apartment the guest asked for." });
      const now = clock.now();
      const existing = (await store.searchGuests(request.phone, 5)).find((candidate) => candidate.phone === request.phone) ?? null;
      const newGuest: Guest | null = existing
        ? null
        : { id: ids.newId(), name: request.name, phone: request.phone, email: request.email, notes: null, createdAt: now, updatedAt: now };
      const booking: Booking = {
        ...bookingFrom({
          id: ids.newId(),
          ref: request.ref,
          guestId: existing?.id ?? newGuest!.id,
          unit,
          stay: request.stay,
          draft: {
            adults: request.adults,
            children: request.children,
            total: parsed.value.total,
            depositDue: parsed.value.depositDue,
            serviceNotes: request.arrivalTime ? `Arriving ${request.arrivalTime}` : null,
            notes: request.notes,
            externalRef: null,
            channel: "direct",
          },
          by: actor.id,
          now,
        }),
        requestId: request.id,
      };
      const outcome = await store.convertRequest({ requestId, today: today(), at: now, by: actor.id, newGuest, booking, block: blockFor(booking, actor.id) });
      if (outcome.status === "request-changed") return refusedWith("This request was already handled, or it has expired. Reload the page.");
      if (outcome.status === "ref-taken") return refusedWith("A booking already has this request's reference. Reload the page and try again.");
      const problem = inventoryProblem(outcome);
      if (problem) return problem as ChangeResult<{ id: string }>;
      await record(actor, "request.accepted", booking, `Accepted request ${request.ref} into ${unit.name}, ${stayLabel(request.stay)}`);
      return done({ id: booking.id });
    },

    /** Changes a booking's unit, dates, party, money or notes, over the revision the editor started from. */
    async change(actor: Actor, id: string, input: unknown): Promise<ChangeResult> {
      access.assertCan(actor, "bookings:change");
      const parsed = parseWith(bookingChangeSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const draft = parsed.value;
      const existing = await store.booking(id);
      if (!existing || !holdsNights(existing.status) || existing.status === "checked-out") return refusedWith(bookingGone);
      const stay = { arrive: draft.arrive, leave: draft.leave };
      if (nightsOf(stay) > maxBookingNights) return refused({ leave: `A booking is for at most ${maxBookingNights} nights.` });
      const unit = await unitFor(draft.unitId);
      if (!unit) return refused({ unitId: "Choose a unit that's offered." });
      // The booking alone, without the guest record it was read with.
      const { guest, ...current } = existing;
      void guest;
      const next: Booking = {
        ...current,
        channel: draft.channel,
        apartment: unit.apartment,
        unitId: unit.id,
        stay,
        adults: draft.adults,
        children: draft.children,
        totalCents: draft.total,
        depositDueCents: draft.depositDue,
        serviceNotes: draft.serviceNotes,
        notes: draft.notes,
        externalRef: draft.externalRef,
        updatedAt: clock.now(),
        revision: draft.revision + 1,
      };
      const outcome = await store.change({ booking: next, expectedRevision: draft.revision });
      if (outcome.status === "stale") return refusedWith("Someone else changed this booking since you opened it. Reload the page to see their changes.");
      if (outcome.status === "missing") return refusedWith(bookingGone);
      const problem = inventoryProblem(outcome);
      if (problem) return problem;
      const moved = existing.unitId !== unit.id || existing.stay.arrive !== stay.arrive || existing.stay.leave !== stay.leave;
      await record(actor, "booking.changed", existing, `Changed booking ${existing.ref}${moved ? `: now ${unit.name}, ${stayLabel(stay)}` : ""}`);
      return done();
    },

    async cancel(actor: Actor, id: string, input: unknown): Promise<ChangeResult> {
      access.assertCan(actor, "bookings:cancel");
      const parsed = parseWith(cancelSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const result = await setStatus(actor, id, { from: ["confirmed"], to: "cancelled", release: true, reason: parsed.value.reason });
      if (!result.ok) return result;
      await record(actor, "booking.cancelled", result.booking!, `Cancelled booking ${result.booking!.ref}; its nights are open again`);
      return done();
    },

    async noShow(actor: Actor, id: string): Promise<ChangeResult> {
      access.assertCan(actor, "stays:check-in-out");
      const on = today();
      const result = await setStatus(actor, id, {
        from: ["confirmed"],
        to: "no-show",
        release: true,
        when: (booking) => (booking.stay.arrive > on ? "A guest can only be a no-show from their arrival day." : null),
      });
      if (!result.ok) return result;
      await record(actor, "booking.no-show", result.booking!, `Marked booking ${result.booking!.ref} a no-show; its nights are open again`);
      return done();
    },

    async checkIn(actor: Actor, id: string): Promise<ChangeResult> {
      access.assertCan(actor, "stays:check-in-out");
      const on = today();
      const result = await setStatus(actor, id, {
        from: ["confirmed"],
        to: "checked-in",
        release: false,
        when: (booking) => (booking.stay.arrive > on ? "The guest can check in from their arrival day." : booking.stay.leave <= on ? "This stay has already ended." : null),
      });
      if (!result.ok) return result;
      await record(actor, "booking.checked-in", result.booking!, `Checked in ${result.booking!.ref}`);
      return done();
    },

    async checkOut(actor: Actor, id: string): Promise<ChangeResult> {
      access.assertCan(actor, "stays:check-in-out");
      // Leaving before the last night: the stay ends today (or after its first night), and the nights left open again. The money stays as it was.
      const leaveOn = (booking: Booking): IsoDate | null => {
        const earliest = addDays(booking.stay.arrive, 1);
        const day = today() > earliest ? today() : earliest;
        return day < booking.stay.leave ? day : null;
      };
      const result = await setStatus(actor, id, { from: ["checked-in"], to: "checked-out", release: false, leaveOn });
      if (!result.ok) return result;
      const early = result.endedOn ? `, leaving early: the stay now ends ${stayLabel(result.booking!.stay)}` : "";
      await record(actor, "booking.checked-out", result.booking!, `Checked out ${result.booking!.ref}${early}`);
      if (deps.onCheckedOut) {
        await deps.onCheckedOut(result.booking!).catch((error: unknown) =>
          deps.reportProblem(`After checking out ${result.booking!.ref}, the follow-up failed (${error instanceof Error ? error.name : typeof error}).`),
        );
      }
      return done();
    },

    async searchGuests(actor: Actor, query: string): Promise<Guest[]> {
      access.assertCan(actor, "guests:view");
      const trimmed = query.trim().slice(0, 80);
      return trimmed.length < 2 ? [] : store.searchGuests(trimmed, 30);
    },

    async guest(actor: Actor, id: string): Promise<{ guest: Guest; bookings: Booking[] } | null> {
      access.assertCan(actor, "guests:view");
      const guest = await store.guest(id);
      return guest ? { guest, bookings: await store.bookingsForGuest(id) } : null;
    },

    async updateGuest(actor: Actor, id: string, input: unknown): Promise<ChangeResult> {
      access.assertCan(actor, "guests:manage");
      const parsed = parseWith(guestChangeSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const guest = await store.guest(id);
      if (!guest) return refusedWith("This guest no longer exists. Reload the page.");
      if (!parsed.value.phone && !parsed.value.email) return refused({ phone: "Keep a phone number or an email address, so you can reach the guest." });
      const updated = await store.updateGuest({ ...guest, ...parsed.value, updatedAt: clock.now() });
      if (!updated) return refusedWith("This guest was removed or anonymised, so their details can't be changed. Reload the page.");
      await audit.record({ actor, category: "guests", action: "guest.changed", target: { type: "guest", id }, summary: `Changed guest details for ${parsed.value.name}` });
      return done();
    },

    /**
     * Today: arrivals, departures and who's in the house. Someone who may see
     * bookings gets them whole; staff get only the guest's name, the unit,
     * the dates and the service notes (roles.md), built here so nothing else
     * reaches the browser.
     */
    async todayView(actor: Actor): Promise<{ full: TodayView<TodayStay> } | { staff: TodayView<StaffStay> }> {
      access.assertCan(actor, "today:view");
      const on = today();
      const [around, units, names] = await Promise.all([store.bookingsAround(on), namesOfUnits(), deps.apartmentNames()]);
      const split = <T>(map: (booking: BookingWithGuest) => T): TodayView<T> => ({
        today: on,
        arrivals: around.filter((booking) => isArrivingOn(booking, on)).map(map),
        departures: around.filter((booking) => isLeavingOn(booking, on)).map(map),
        inHouse: around.filter((booking) => isInHouse(booking, on)).map(map),
      });
      const unitName = (id: string) => units.get(id)?.name ?? "A unit";
      if (access.can(actor, "bookings:view")) {
        return { full: split((booking) => ({ ...booking, unitName: unitName(booking.unitId), apartmentName: names[booking.apartment] ?? booking.apartment })) };
      }
      return {
        staff: split((booking) => ({
          id: booking.id,
          guestName: booking.guest.name,
          unitName: unitName(booking.unitId),
          stay: booking.stay,
          status: booking.status,
          serviceNotes: booking.serviceNotes,
        })),
      };
    },

    /** The availability chart from `from` for `nights` nights: every unit, and what holds each night. */
    async chart(actor: Actor, from: IsoDate, nights: number): Promise<ChartView> {
      access.assertCan(actor, "availability:view");
      const until = addDays(from, Math.max(1, Math.min(nights, 62)));
      const range = { arrive: from, leave: until };
      const [units, blocks, bookings, names] = await Promise.all([inventory.units(), inventory.blocksOverlapping(range), store.bookingsOverlapping(range), deps.apartmentNames()]);
      return {
        from,
        until,
        units: units
          .filter((unit) => unit.active)
          .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
          .map((unit) => ({ ...unit, apartmentName: names[unit.apartment] ?? unit.apartment })),
        blocks,
        bookings: Object.fromEntries(bookings.map((booking) => [booking.id, { ref: booking.ref, guestName: booking.guest.name, status: booking.status }])),
      };
    },
  };
}

export type ReservationService = ReturnType<typeof createReservationService>;
