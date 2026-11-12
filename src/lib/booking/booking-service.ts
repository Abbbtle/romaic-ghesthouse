import type { IsoDate } from "@/lib/format/zoned-time";
import type { InventoryService, StaySearch } from "@/lib/inventory/inventory-service";
import { stayLabel, type Stay } from "@/lib/inventory/stays";
import type { AvailabilityBlock } from "@/lib/inventory/units";
import type { Actor } from "@/lib/kernel/actor";
import type { AuditRecorder } from "@/lib/kernel/audit";
import type { EmailSender } from "@/lib/kernel/email";
import type { Clock, IdGenerator } from "@/lib/kernel/ports";
import { done, formErrorKey, refused, refusedWith, type ChangeResult, type FieldErrors } from "@/lib/kernel/result";
import { parseWith } from "@/lib/forms/parse";
import type { BookingAccess, BookingStore, FormTokens, RandomSource, RequestCreation, RequestRateLimits } from "./ports";
import { newRequestRef } from "./reference-codes";
import { newRequestEmail } from "./request-email";
import { acceptInputSchema, botSignalsOf, declineInputSchema, echoedRequestOf, parseRequestInput } from "./request-input";
import { guestsOf, statusOn, type BookingRequest } from "./requests";
import { housekeepingAt } from "./retention";
import { formTimingOf, maxWaitingPerPhone, phoneLimitMessage, siteWideKey, staleFormMessage } from "./spam-rules";

export type BookingServiceDependencies = {
  requests: BookingStore;
  /** Apartments, availability and "today", from the inventory core. */
  inventory: InventoryService;
  formTokens: FormTokens;
  /** Requests per visitor key: five an hour and twenty a day (see requestRateLimits). */
  limits: RequestRateLimits;
  random: RandomSource;
  /** The versions of the consent wording and privacy notice the form shows (from the site's content), recorded with each request. */
  consentVersions: () => Promise<{ consent: string; notice: string }>;
  /** How the new-request alert goes out; null when email isn't set up (requests still arrive in the dashboard). */
  email: EmailSender | null;
  /** The guesthouse's own address the alert goes to (the site's contact email); null when there's none. */
  alertAddress: () => Promise<string | null>;
  /** Runs work after the response has gone (Next's after()), so a slow mail server never keeps a guest waiting. */
  runAfterResponse: (task: () => Promise<void>) => void;
  /** Logs a problem nobody can be shown, such as an alert that couldn't be sent. */
  reportProblem: (message: string) => void;
  /** The dashboard's requests page as a full address, for the alert email. */
  requestsPageUrl: string;
  clock: Clock;
  ids: IdGenerator;
  audit: AuditRecorder;
  access: BookingAccess;
};

/** Who's sending a request: a keyed hash of their IP address, never the address itself. */
export type Visitor = { key: string };

export type RequestSent = { status: "sent"; ref: string; apartment: string; stay: Stay; guests: number };

/**
 * How a submission went. Bots get a normal-looking "sent" with a throwaway
 * reference. "invalid" carries field errors, or a problem with the whole
 * request under "form" (a stale form, a duplicate, too many waiting).
 */
export type SubmitResult =
  | RequestSent
  | { status: "invalid"; errors: FieldErrors }
  /** The apartment can't be asked for on these dates any more: it's full, too small or no longer offered. */
  | { status: "unavailable"; reason: "full" | "too-small" | "unknown-apartment" }
  | { status: "rate-limited" };

/** Reference codes rarely collide; the store refuses one in use and another is drawn. */
const maxRefDraws = 5;

/** How many handled requests the dashboard lists. */
export const handledListLength = 100;

/** How many waiting requests the dashboard lists at once (soonest first); far more than the house ever has. */
export const waitingListLength = 100;

function wholeRequestProblem(message: string): SubmitResult {
  return { status: "invalid", errors: { [formErrorKey]: message } };
}

const requestGone = "This request was already handled, or it has expired. Reload the page.";

/** The note an accepted request carries once it's cancelled. */
export const cancelledNote = "Cancelled after accepting";

/**
 * Booking requests, from the public form to the owner's decision:
 * - form: the signed form token, and sending a request (guests);
 * - inbox: the waiting and handled lists, one request, the waiting count;
 * - decisions: accept (with the unit, atomic with closing its nights) and decline;
 * - maintenance: the daily expiry, retention and visitor-key clean-up.
 */
export function createBookingService(deps: BookingServiceDependencies) {
  const { requests, inventory, clock, ids, audit, access } = deps;
  const today = () => inventory.today();

  /** A believable receipt for a bot. Nothing is stored, counted or sent. */
  function decoy(input: unknown): RequestSent {
    const echoed = echoedRequestOf(input, today());
    return {
      status: "sent",
      ref: newRequestRef(deps.random),
      apartment: echoed.apartment,
      stay: { arrive: echoed.arrive, leave: echoed.leave },
      guests: echoed.adults + echoed.children,
    };
  }

  /** Counts the attempt in every window (the visitor's hour and day, and the site's hour), so none can be used up unnoticed. */
  async function withinLimits(visitor: Visitor): Promise<boolean> {
    const allowed = await Promise.all([
      deps.limits.perHour.tryConsume(visitor.key),
      deps.limits.perDay.tryConsume(visitor.key),
      deps.limits.siteWide.tryConsume(siteWideKey),
    ]);
    return allowed.every(Boolean);
  }

  /** Stores the request, drawing a new reference code while the one drawn is in use. */
  async function store(request: BookingRequest): Promise<{ status: "created"; request: BookingRequest } | Exclude<RequestCreation, { status: "created" | "ref-taken" }>> {
    let candidate = request;
    for (let draw = 1; draw <= maxRefDraws; draw += 1) {
      const outcome = await requests.create(candidate, { maxWaitingPerPhone, today: today() });
      if (outcome.status === "created") return { status: "created", request: candidate };
      if (outcome.status !== "ref-taken") return outcome;
      candidate = { ...candidate, ref: newRequestRef(deps.random) };
    }
    throw new Error(`No unused reference code after ${maxRefDraws} draws.`);
  }

  /** Emails the guesthouse, when email is set up and there's an address. Never the guest. Only the sending waits for after the response. */
  async function alertOwner(request: BookingRequest): Promise<void> {
    const sender = deps.email;
    if (!sender) return;
    const to = await deps.alertAddress();
    if (!to) {
      deps.reportProblem("A booking request arrived, but there's no contact email to alert.");
      return;
    }
    const message = newRequestEmail(request, { to, requestsPageUrl: deps.requestsPageUrl });
    deps.runAfterResponse(async () => {
      const delivery = await sender.send(message);
      if (!delivery.ok) deps.reportProblem(`The new-request alert wasn't sent: ${delivery.reason}`);
    });
  }

  async function waitingRequest(id: string): Promise<BookingRequest | null> {
    const request = await requests.request(id);
    return request && statusOn(request, today()) === "waiting" ? request : null;
  }

  const form = {
    /** The token the booking form carries: the signed time it was shown. Call it when rendering the form. */
    issueToken(): string {
      return deps.formTokens.sign(clock.now());
    },

    /**
     * Sends a booking request. In order: bots (honeypot, under 3 seconds)
     * get a decoy receipt; a stale or forged form must be reloaded; invalid
     * fields, the dates' rules, the visitor's limits (5 an hour, 20 a day),
     * the apartment's availability and the phone's limits refuse it. Only
     * then is it stored, waiting, and the owner alerted. Nothing is ever
     * emailed to the guest. `input` is the form as sent.
     */
    async submit(input: unknown, visitor: Visitor): Promise<SubmitResult> {
      const now = clock.now();
      const signals = botSignalsOf(input);
      if (signals.honeypotFilled) return decoy(input);
      const timing = formTimingOf(signals.formToken ? deps.formTokens.verify(signals.formToken) : null, now);
      if (timing === "too-fast") return decoy(input);
      if (timing === "stale") return wholeRequestProblem(staleFormMessage);

      const parsed = parseRequestInput(input);
      if (!parsed.ok) return { status: "invalid", errors: parsed.errors };
      const draft = parsed.value;
      const search = inventory.checkSearch({ arrive: draft.arrive, leave: draft.leave, guests: draft.adults + draft.children });
      if (!search.ok) return { status: "invalid", errors: search.errors.guests ? { ...search.errors, children: search.errors.guests } : search.errors };

      if (!(await withinLimits(visitor))) return { status: "rate-limited" };

      const requestable = await inventory.requestability(draft.apartment, search.value);
      if (!requestable.ok) return { status: "unavailable", reason: requestable.reason };

      const versions = await deps.consentVersions();
      const stored = await store({
        id: ids.newId(),
        ref: newRequestRef(deps.random),
        apartment: requestable.apartment.slug,
        apartmentName: requestable.apartment.name,
        stay: { arrive: draft.arrive, leave: draft.leave },
        adults: draft.adults,
        children: draft.children,
        name: draft.name,
        phone: draft.phone,
        email: draft.email,
        arrivalTime: draft.arrivalTime,
        notes: draft.notes,
        consent: { at: now, consentVersion: versions.consent, noticeVersion: versions.notice },
        status: "waiting",
        visitorKey: visitor.key,
        createdAt: now,
        decision: null,
      });
      // Both refusals read the same (see phoneLimitMessage).
      if (stored.status === "duplicate" || stored.status === "too-many-waiting") return wholeRequestProblem(phoneLimitMessage);
      // Stored: a problem with the alert is reported, never shown to the guest.
      await alertOwner(stored.request).catch((error: unknown) =>
        deps.reportProblem(`The new-request alert couldn't be prepared (${error instanceof Error ? error.name : typeof error}).`),
      );
      const { request } = stored;
      return { status: "sent", ref: request.ref, apartment: request.apartment, stay: request.stay, guests: guestsOf(request) };
    },
  };

  const inbox = {
    /** Requests waiting for a decision, soonest arrival first. */
    async waiting(actor: Actor): Promise<BookingRequest[]> {
      access.assertCan(actor, "bookings:view");
      return requests.waiting(today(), waitingListLength);
    },
    /** The most recent requests that aren't waiting, with expiries shown as expired. */
    async handled(actor: Actor): Promise<BookingRequest[]> {
      access.assertCan(actor, "bookings:view");
      const on = today();
      return (await requests.handled(on, handledListLength)).map((request) => ({ ...request, status: statusOn(request, on) }));
    },
    async request(actor: Actor, id: string): Promise<BookingRequest | null> {
      access.assertCan(actor, "bookings:view");
      const request = await requests.request(id);
      return request ? { ...request, status: statusOn(request, today()) } : null;
    },
    /** The badge count; 0 for anyone who can't see requests. */
    async waitingCount(actor: Actor): Promise<number> {
      if (!access.can(actor, "bookings:view")) return 0;
      return requests.waitingCount(today());
    },
  };

  const decisions = {
    /** Accepts a waiting request into the chosen unit, closing its nights to everyone else, all at once. */
    async accept(actor: Actor, requestId: string, input: unknown): Promise<ChangeResult> {
      access.assertCan(actor, "bookings:create");
      const parsed = parseWith(acceptInputSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const request = await waitingRequest(requestId);
      if (!request) return refusedWith(requestGone);
      const free = await inventory.freeUnits(actor, request.apartment, request.stay);
      if (!free.some((unit) => unit.id === parsed.value.unitId)) {
        return refused({ unitId: "That unit isn't free for every night of this stay. Choose another, or decline the request." });
      }
      const now = clock.now();
      const block: AvailabilityBlock = {
        id: ids.newId(),
        unitId: parsed.value.unitId,
        stay: request.stay,
        reason: "request",
        note: `Request ${request.ref}`,
        requestId: request.id,
        createdBy: actor.id,
        createdAt: now,
      };
      const outcome = await requests.accept({ requestId, block, at: now, by: actor.id, today: today() });
      if (outcome.status === "request-changed") return refusedWith(requestGone);
      if (outcome.status === "overlaps") return refused({ unitId: "Someone just closed or booked that unit on one of these nights. Choose another." });
      if (outcome.status === "unit-unavailable") return refused({ unitId: "That unit isn't offered any more. Choose another." });
      const unitName = free.find((unit) => unit.id === parsed.value.unitId)?.name ?? "a unit";
      await audit.record({
        actor,
        category: "bookings",
        action: "request.accepted",
        target: { type: "booking-request", id: requestId },
        summary: `Accepted request ${request.ref} for ${request.apartmentName}, ${stayLabel(request.stay)}, in ${unitName}`,
      });
      return done();
    },

    /** Declines a waiting request, with an optional private note. */
    async decline(actor: Actor, requestId: string, input: unknown): Promise<ChangeResult> {
      access.assertCan(actor, "bookings:cancel");
      const parsed = parseWith(declineInputSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const request = await waitingRequest(requestId);
      if (!request) return refusedWith(requestGone);
      const declined = await requests.decline({ requestId, at: clock.now(), by: actor.id, note: parsed.value.note, today: today() });
      if (!declined) return refusedWith(requestGone);
      await audit.record({
        actor,
        category: "bookings",
        action: "request.declined",
        target: { type: "booking-request", id: requestId },
        summary: `Declined request ${request.ref} for ${request.apartmentName}, ${stayLabel(request.stay)}`,
      });
      return done();
    },

    /**
     * Cancels an accepted request whose guest hasn't left yet: its nights open
     * again in the unit, and it moves to declined with a note saying why.
     * Nothing is sent to the guest.
     */
    async cancel(actor: Actor, requestId: string): Promise<ChangeResult> {
      access.assertCan(actor, "bookings:cancel");
      const request = await requests.request(requestId);
      if (!request || request.status !== "accepted") return refusedWith("This booking was already cancelled, or isn't an accepted request. Reload the page.");
      const released = await requests.release({ requestId, at: clock.now(), by: actor.id, note: cancelledNote, today: today() });
      if (!released) return refusedWith("This stay has already ended, so it can't be cancelled here.");
      await audit.record({
        actor,
        category: "bookings",
        action: "request.cancelled",
        target: { type: "booking-request", id: requestId },
        summary: `Cancelled accepted request ${request.ref} for ${request.apartmentName}, ${stayLabel(request.stay)}; its nights are open again`,
      });
      return done();
    },
  };

  const maintenance = {
    /** The daily clean-up: expire, delete what's past its retention, forget visitor keys. */
    async housekeeping() {
      return requests.housekeeping(housekeepingAt(clock.now(), today()));
    },
  };

  return { form, inbox, decisions, maintenance };
}

export type BookingService = ReturnType<typeof createBookingService>;
export type { StaySearch, IsoDate };
