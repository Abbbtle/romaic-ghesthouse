import { parseWith } from "@/lib/forms/parse";
import { formatDateShort } from "@/lib/format/date-time";
import { compareIsoDates, zonedToday, type IsoDate } from "@/lib/format/zoned-time";
import type { Actor } from "@/lib/kernel/actor";
import type { AuditRecorder } from "@/lib/kernel/audit";
import type { Clock, IdGenerator } from "@/lib/kernel/ports";
import { done, refused, refusedWith, type ChangeResult } from "@/lib/kernel/result";
import type { Booking, Guest } from "@/lib/reservations/reservations";
import { guestExport } from "./guest-export";
import type { ContactVault, GuestRecords, PrivacyAccess, PrivacyStore, RecordKeepingSource, RetentionStore } from "./ports";
import {
  activeStayStatuses,
  breachStatusNames,
  byDiscovery,
  breachToDo,
  byUrgency,
  contactContext,
  isOpen,
  maskedContact,
  normalisedContact,
  requestKindNames,
  urgencyOf,
  viewOf,
  type Breach,
  type DataSubjectRequest,
  type InformationOfficer,
  type PublicInformationOfficer,
  type RequestView,
} from "./privacy";
import {
  anonymiseSchema,
  answerSchema,
  breachSchema,
  changeRequestSchema,
  identitySchema,
  newRequestSchema,
  officerSchema,
  policyPeriodSchema,
  refuseSchema,
  revisionSchema,
  type BreachDraft,
} from "./privacy-input";
import {
  currentPolicies,
  defaultPeriod,
  isAdjustable,
  isRetentionKind,
  months,
  periodRange,
  planRetention,
  retentionKindNames,
  retentionKinds,
  retentionSchedule,
  years,
  type RecordKeeping,
  type RetentionPlan,
  type RetentionRun,
  type RetentionRunReport,
  type ScheduleRow,
} from "./retention";

export type PrivacyServiceDependencies = {
  store: PrivacyStore;
  retention: RetentionStore;
  guests: GuestRecords;
  vault: ContactVault;
  recordKeeping: RecordKeepingSource;
  /** Apartment names by slug and unit names by id, for the guest export. */
  names: () => Promise<{ apartments: Record<string, string>; units: Record<string, string> }>;
  clock: Clock;
  ids: IdGenerator;
  audit: AuditRecorder;
  access: PrivacyAccess;
  timeZone: string;
};

/** A guest as a request about them needs them: the record, when it was anonymised, and their bookings. */
export type HeldGuest = {
  guest: Guest;
  anonymisedAt: Date | null;
  bookings: Booking[];
  /** Why the guest can't be anonymised now, or null when they can. */
  anonymiseBlocked: string | null;
};

/** What the next run would do: counts only, with whether each rule runs, and why not. */
export type RetentionPreview = {
  guests: { runs: boolean; count: number | null; cutoff: IsoDate | null; period: number | null; reason: string | null };
  taskPhotos: { runs: boolean; count: number | null; cutoff: Date | null; period: number | null; reason: string | null };
};

export type RetentionView = {
  today: IsoDate;
  keeping: RecordKeeping;
  schedule: ScheduleRow[];
  preview: RetentionPreview;
  runs: RetentionRun[];
};

export type PrivacyOverview = {
  today: IsoDate;
  officer: InformationOfficer | null;
  requests: { open: number; overdue: number; dueSoon: number; next: RequestView[] };
  breaches: { ongoing: number; withSteps: number; total: number };
  retention: { confirmed: number; total: number; lastRun: RetentionRun | null };
};

const requestGone = "This request changed or no longer exists. Reload the page.";
const breachGone = "This breach changed since you opened it. Reload the page.";
const guestGone = "This guest no longer exists. Reload the page.";
const notInFuture = "Choose today or an earlier day.";
const activeStay = "They have a stay booked or under way. Anonymise them once it's checked out or cancelled.";

/**
 * POPIA from the dashboard, for the owner only: the Information Officer's
 * details, the data-subject request log (with finding, exporting and
 * anonymising the guest a request is about), the breach register, and the
 * retention schedule with its preview. Every method checks privacy:requests
 * first. Two groups take no actor: `maintenance` (the daily job's run) and
 * `notice` (the public privacy notice's view of the officer's details).
 *
 * Every change is in the activity log under "privacy", which only the owner
 * reads, and never with a requester's or guest's name or contact in it: the
 * log can't be changed, so a name there would outlive an anonymised record.
 */
export function createPrivacyService(deps: PrivacyServiceDependencies) {
  const { store, retention, guests, vault, clock, ids, audit, access } = deps;
  const today = () => zonedToday(clock.now(), deps.timeZone);
  const guard = (actor: Actor) => access.assertCan(actor, "privacy:requests");

  async function record(actor: Actor | null, action: string, summary: string, target?: { type: string; id: string }, details?: Record<string, unknown>) {
    await audit.record({ actor, category: "privacy", action, summary, target, details });
  }

  /** Saves a changed request over the revision it was read at. */
  async function saveRequest(request: DataSubjectRequest, changes: Partial<DataSubjectRequest>, expectedRevision = request.revision): Promise<DataSubjectRequest | null> {
    const next: DataSubjectRequest = { ...request, ...changes, updatedAt: clock.now(), revision: expectedRevision + 1 };
    return (await store.updateRequest(next, expectedRevision)) ? next : null;
  }

  async function heldGuest(guestId: string): Promise<HeldGuest | null> {
    const guest = await guests.guest(guestId);
    if (!guest) return null;
    const [bookings, anonymisedAt] = await Promise.all([guests.bookingsForGuest(guestId), retention.anonymisedAt(guestId)]);
    const busy = bookings.some((booking) => (activeStayStatuses as readonly string[]).includes(booking.status));
    return {
      guest,
      anonymisedAt,
      bookings,
      anonymiseBlocked: anonymisedAt ? "This guest's record is already anonymised." : busy ? activeStay : null,
    };
  }

  async function plan(): Promise<{ plan: RetentionPlan; keeping: RecordKeeping }> {
    const on = today();
    const [policies, keeping] = await Promise.all([store.policies(), deps.recordKeeping(on)]);
    return { plan: planRetention({ policies, keeping, today: on, timeZone: deps.timeZone }), keeping };
  }

  async function previewOf(next: RetentionPlan): Promise<RetentionPreview> {
    const { guests: guestRule, taskPhotos } = next;
    const [guestCount, photoCount] = await Promise.all([
      guestRule.cutoff ? retention.countInactiveGuests(guestRule.cutoff) : Promise.resolve(null),
      taskPhotos.cutoff ? retention.countTaskPhotos(taskPhotos.cutoff) : Promise.resolve(null),
    ]);
    return {
      guests: { runs: guestRule.status === "ready", count: guestCount, cutoff: guestRule.cutoff, period: guestRule.period, reason: guestRule.status === "waiting" ? guestRule.reason : null },
      taskPhotos: { runs: taskPhotos.status === "ready", count: photoCount, cutoff: taskPhotos.cutoff, period: taskPhotos.period, reason: taskPhotos.status === "waiting" ? taskPhotos.reason : null },
    };
  }

  /** Dates on a breach that can't be after today. */
  function futureBreachDates(draft: BreachDraft): Record<string, string> {
    const on = today();
    const errors: Record<string, string> = {};
    for (const key of ["discoveredOn", "containedOn", "regulatorToldOn", "peopleToldOn"] as const) {
      const day = draft[key];
      if (day && compareIsoDates(day, on) > 0) errors[key] = notInFuture;
    }
    return errors;
  }

  async function addPolicyVersion(actor: Actor, kind: (typeof retentionKinds)[number], period: number | null): Promise<number | null> {
    const policies = await store.policies();
    const version = Math.max(0, ...policies.filter((policy) => policy.kind === kind).map((policy) => policy.version)) + 1;
    const outcome = await store.addPolicy({ id: ids.newId(), kind, version, period, setBy: actor.id, setByName: actor.name, setAt: clock.now() });
    return outcome === "added" ? version : null;
  }

  return {
    today,

    /** The privacy page's summary: the officer, requests needing an answer, breaches with steps left, and the retention schedule's state. */
    async overview(actor: Actor): Promise<PrivacyOverview> {
      guard(actor);
      const on = today();
      const [requests, breaches, officer, policies, runs] = await Promise.all([store.requests(), store.breaches(), store.officer(), store.policies(), store.runs(1)]);
      const open = byUrgency(requests.filter((request) => isOpen(request.status)));
      const current = currentPolicies(policies);
      return {
        today: on,
        officer,
        requests: {
          open: open.length,
          overdue: open.filter((request) => urgencyOf(request, on) === "overdue").length,
          dueSoon: open.filter((request) => urgencyOf(request, on) === "due-soon").length,
          next: open.slice(0, 3).map(viewOf),
        },
        breaches: {
          ongoing: breaches.filter((breach) => breach.status === "ongoing").length,
          withSteps: breaches.filter((breach) => breachToDo(breach).length > 0).length,
          total: breaches.length,
        },
        retention: { confirmed: retentionKinds.filter((kind) => current[kind]).length, total: retentionKinds.length, lastRun: runs[0] ?? null },
      };
    },

    // --- the Information Officer ---------------------------------------------------

    async officer(actor: Actor): Promise<InformationOfficer | null> {
      guard(actor);
      return store.officer();
    },

    async saveOfficer(actor: Actor, input: unknown): Promise<ChangeResult> {
      guard(actor);
      const parsed = parseWith(officerSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      await store.saveOfficer({ ...parsed.value, updatedAt: clock.now(), updatedBy: actor.id });
      await record(actor, "privacy.officer-saved", "Saved the Information Officer's details");
      return done();
    },

    // --- data-subject requests ---------------------------------------------------

    /** Every request: open ones first (overdue, then soonest due), then closed ones. */
    async requests(actor: Actor): Promise<RequestView[]> {
      guard(actor);
      return byUrgency(await store.requests()).map(viewOf);
    },

    /** One request, with the guest it's about when one is linked. */
    async request(actor: Actor, id: string): Promise<{ request: RequestView; guest: HeldGuest | null } | null> {
      guard(actor);
      const found = await store.request(id);
      if (!found) return null;
      return { request: viewOf(found), guest: found.guestId ? await heldGuest(found.guestId) : null };
    },

    /** Logs a request as it arrived. Their contact is sealed, bound to this request; only a masked hint stays readable. */
    async logRequest(actor: Actor, input: unknown): Promise<ChangeResult<{ id: string }>> {
      guard(actor);
      const parsed = parseWith(newRequestSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const draft = parsed.value;
      if (compareIsoDates(draft.receivedOn, today()) > 0) return refused({ receivedOn: notInFuture });
      const id = ids.newId();
      const contact = draft.contact ? normalisedContact(draft.contact) : null;
      const now = clock.now();
      await store.addRequest({
        id,
        kind: draft.kind,
        requesterName: draft.requesterName,
        contactSealed: contact ? vault.seal(contact, contactContext(id)) : null,
        contactHint: contact ? maskedContact(contact) : null,
        receivedOn: draft.receivedOn,
        dueOn: draft.dueOn,
        status: "received",
        details: draft.details,
        notes: draft.notes,
        guestId: null,
        identityConfirmedOn: null,
        identityNote: null,
        closedOn: null,
        outcome: null,
        createdBy: actor.id,
        createdAt: now,
        updatedAt: now,
        revision: 1,
      });
      await record(actor, "privacy.request-logged", `Logged ${article(requestKindNames[draft.kind])} request received ${formatDateShort(draft.receivedOn)}, due ${formatDateShort(draft.dueOn)}`, {
        type: "privacy-request",
        id,
      });
      return done({ id });
    },

    /** Changes what a request is and when it's due (while it's open), and its notes (at any time). */
    async changeRequest(actor: Actor, id: string, input: unknown): Promise<ChangeResult> {
      guard(actor);
      const parsed = parseWith(changeRequestSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const { revision, ...draft } = parsed.value;
      const request = await store.request(id);
      if (!request || request.revision !== revision) return refusedWith(requestGone);
      const reshaped = draft.kind !== request.kind || draft.dueOn !== request.dueOn || draft.details !== request.details;
      if (reshaped && !isOpen(request.status)) return refusedWith("This request is closed: only its notes can change.");
      if (compareIsoDates(draft.dueOn, request.receivedOn) < 0) return refused({ dueOn: "Choose a day on or after the day you received it." });
      if (!(await saveRequest(request, draft, revision))) return refusedWith(requestGone);
      const dueChanged = draft.dueOn !== request.dueOn ? `; now due ${formatDateShort(draft.dueOn)}` : "";
      await record(actor, "privacy.request-changed", `Changed a request's details${dueChanged}`, { type: "privacy-request", id });
      return done();
    },

    async startRequest(actor: Actor, id: string, input: unknown): Promise<ChangeResult> {
      guard(actor);
      const parsed = parseWith(revisionSchema, input);
      if (!parsed.ok) return refusedWith(requestGone);
      const request = await store.request(id);
      if (!request || request.revision !== parsed.value.revision || request.status !== "received") return refusedWith(requestGone);
      if (!(await saveRequest(request, { status: "in-progress" }))) return refusedWith(requestGone);
      await record(actor, "privacy.request-started", "Started work on a request", { type: "privacy-request", id });
      return done();
    },

    async answerRequest(actor: Actor, id: string, input: unknown): Promise<ChangeResult> {
      guard(actor);
      const parsed = parseWith(answerSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      return close(actor, id, "answered", parsed.value);
    },

    async refuseRequest(actor: Actor, id: string, input: unknown): Promise<ChangeResult> {
      guard(actor);
      const parsed = parseWith(refuseSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      return close(actor, id, "refused", parsed.value);
    },

    /** Notes that the owner is satisfied the requester is who they say, and how they checked. */
    async confirmIdentity(actor: Actor, id: string, input: unknown): Promise<ChangeResult> {
      guard(actor);
      const parsed = parseWith(identitySchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const request = await store.request(id);
      if (!request || request.revision !== parsed.value.revision) return refusedWith(requestGone);
      if (!(await saveRequest(request, { identityConfirmedOn: today(), identityNote: parsed.value.how }))) return refusedWith(requestGone);
      await record(actor, "privacy.request-identity-confirmed", "Confirmed who made a request", { type: "privacy-request", id });
      return done();
    },

    /** Links the guest record a request is about (found with searchGuests). */
    async linkGuest(actor: Actor, id: string, guestId: string): Promise<ChangeResult> {
      guard(actor);
      const request = await store.request(id);
      if (!request) return refusedWith(requestGone);
      if (!(await guests.guest(guestId))) return refusedWith(guestGone);
      if (!(await saveRequest(request, { guestId }))) return refusedWith(requestGone);
      await record(actor, "privacy.request-guest-linked", "Linked a request to a guest record", { type: "privacy-request", id }, { guestId });
      return done();
    },

    async unlinkGuest(actor: Actor, id: string): Promise<ChangeResult> {
      guard(actor);
      const request = await store.request(id);
      if (!request || !request.guestId) return refusedWith(requestGone);
      if (!(await saveRequest(request, { guestId: null }))) return refusedWith(requestGone);
      await record(actor, "privacy.request-guest-unlinked", "Unlinked a request from a guest record", { type: "privacy-request", id });
      return done();
    },

    /** Opens a requester's contact, to answer them. Each look is in the activity log (without the contact). */
    async revealContact(actor: Actor, id: string): Promise<ChangeResult<{ contact: string }>> {
      guard(actor);
      const request = await store.request(id);
      if (!request) return refusedWith(requestGone);
      if (!request.contactSealed) return refusedWith("They didn't leave a contact.");
      let contact: string;
      try {
        contact = vault.open(request.contactSealed, contactContext(id));
      } catch {
        return refusedWith("The contact can't be opened: the key that sealed it may have been removed. Ask Weberu to check the encryption keys.");
      }
      await record(actor, "privacy.request-contact-viewed", "Viewed the contact on a request", { type: "privacy-request", id });
      return done({ contact });
    },

    // --- guests, for a request about them ----------------------------------------

    /** Guests by part of their name, phone or email, through the reservations core's search. At least two characters. */
    async searchGuests(actor: Actor, query: string): Promise<Guest[]> {
      guard(actor);
      const trimmed = query.trim().slice(0, 80);
      return trimmed.length < 2 ? [] : guests.searchGuests(trimmed, 30);
    },

    /** What's held about a guest: their record, when it was anonymised, their bookings, and whether it can be anonymised now. */
    async guestRecord(actor: Actor, guestId: string): Promise<HeldGuest | null> {
      guard(actor);
      return heldGuest(guestId);
    },

    /** What's held about a guest as a spreadsheet file, for an access request. The download itself asks for a recent step-up. */
    async exportGuest(actor: Actor, guestId: string): Promise<{ fileName: string; csv: string } | null> {
      guard(actor);
      const held = await heldGuest(guestId);
      if (!held) return null;
      const names = await deps.names();
      const file = guestExport({
        guest: held.guest,
        anonymisedAt: held.anonymisedAt,
        bookings: held.bookings,
        apartmentNames: names.apartments,
        unitNames: names.units,
        exportedOn: today(),
        timeZone: deps.timeZone,
      });
      await record(actor, "privacy.guest-exported", "Exported what's held about a guest", { type: "guest", id: guestId }, { bookings: held.bookings.length });
      return file;
    },

    /**
     * Anonymises one guest on request, for good: their name becomes
     * "Anonymised guest", their phone, email and notes go, and so do the
     * notes on their bookings. Refused while they have a stay booked or
     * under way, and when their name isn't the one the owner confirmed
     * (the page was out of date). Bookings and invoices stay.
     */
    async anonymiseGuest(actor: Actor, guestId: string, input: unknown): Promise<ChangeResult> {
      guard(actor);
      const parsed = parseWith(anonymiseSchema, input);
      if (!parsed.ok) return refusedWith(guestGone);
      const held = await heldGuest(guestId);
      if (!held) return refusedWith(guestGone);
      if (held.anonymisedAt) return refusedWith("This guest's record is already anonymised.");
      if (held.guest.name !== parsed.value.confirmName) return refusedWith("This guest's details changed since you opened the page. Reload it and check again.");
      const outcome = await retention.anonymiseGuest(guestId, clock.now());
      switch (outcome.status) {
        case "missing":
          return refusedWith(guestGone);
        case "already":
          return refusedWith("This guest's record is already anonymised.");
        case "active-stay":
          return refusedWith(activeStay);
      }
      const requestId = parsed.value.requestId && (await store.request(parsed.value.requestId)) ? parsed.value.requestId : null;
      await record(actor, "privacy.guest-anonymised", requestId ? "Anonymised a guest record for a request" : "Anonymised a guest record on request", { type: "guest", id: guestId }, {
        bookingsCleared: outcome.bookingsCleared,
        requestsDeleted: outcome.requestsDeleted,
        ...(requestId ? { requestId } : {}),
      });
      return done();
    },

    // --- the breach register -----------------------------------------------------

    async breaches(actor: Actor): Promise<Breach[]> {
      guard(actor);
      return byDiscovery(await store.breaches());
    },

    async breach(actor: Actor, id: string): Promise<Breach | null> {
      guard(actor);
      return store.breach(id);
    },

    async recordBreach(actor: Actor, input: unknown): Promise<ChangeResult<{ id: string }>> {
      guard(actor);
      const parsed = parseWith(breachSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const future = futureBreachDates(parsed.value);
      if (Object.keys(future).length > 0) return refused(future);
      const id = ids.newId();
      const now = clock.now();
      await store.addBreach({ ...parsed.value, id, createdBy: actor.id, createdAt: now, updatedAt: now, revision: 1 });
      await record(actor, "privacy.breach-recorded", `Recorded a breach discovered ${formatDateShort(parsed.value.discoveredOn)} (${breachStatusNames[parsed.value.status].toLowerCase()})`, {
        type: "breach",
        id,
      });
      return done({ id });
    },

    async changeBreach(actor: Actor, id: string, input: unknown): Promise<ChangeResult> {
      guard(actor);
      const parsed = parseWith(breachSchema, input);
      const version = parseWith(revisionSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      if (!version.ok) return refusedWith(breachGone);
      const future = futureBreachDates(parsed.value);
      if (Object.keys(future).length > 0) return refused(future);
      const breach = await store.breach(id);
      if (!breach || breach.revision !== version.value.revision) return refusedWith(breachGone);
      const next: Breach = { ...breach, ...parsed.value, updatedAt: clock.now(), revision: breach.revision + 1 };
      if (!(await store.updateBreach(next, breach.revision))) return refusedWith(breachGone);
      await record(actor, "privacy.breach-changed", `Breach discovered ${formatDateShort(breach.discoveredOn)}: ${breachChanges(breach, next)}`, { type: "breach", id });
      return done();
    },

    // --- retention ---------------------------------------------------------------

    /** The schedule, what the next run would do, and the latest runs. */
    async retention(actor: Actor): Promise<RetentionView> {
      guard(actor);
      const [{ plan: next, keeping }, policies, runs] = await Promise.all([plan(), store.policies(), store.runs(10)]);
      return { today: today(), keeping, schedule: retentionSchedule(policies, keeping), preview: await previewOf(next), runs };
    },

    /** Sets an adjustable kind's period (guest records in years, task photos in months): a new version, which also confirms it. */
    async setPolicy(actor: Actor, kind: string, input: unknown): Promise<ChangeResult> {
      guard(actor);
      if (!isRetentionKind(kind) || !isAdjustable(kind)) return refusedWith("This rule can't be changed here.");
      const parsed = parseWith(policyPeriodSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const range = periodRange(kind, await deps.recordKeeping(today()));
      if ("refused" in range) return refused({ period: range.refused });
      const period = parsed.value.period;
      const unit = kind === "guest-records" ? years : months;
      if (period < range.min || period > range.max) {
        const floor = kind === "guest-records" ? `at least ${unit(range.min)} (SARS's record-keeping period)` : `at least ${unit(range.min)}`;
        return refused({ period: `Choose ${floor} and at most ${unit(range.max)}.` });
      }
      const version = await addPolicyVersion(actor, kind, period);
      if (version === null) return refusedWith("Someone changed this rule at the same moment. Reload the page.");
      await record(actor, "privacy.retention-set", `Set ${retentionKindNames[kind].toLowerCase()} to ${unit(period)} (version ${version})`, { type: "retention-policy", id: kind });
      return done();
    },

    /** Confirms a kind's rule as it stands: the default (or the period in force), or a rule that isn't set here. A new version each time. */
    async confirmPolicy(actor: Actor, kind: string): Promise<ChangeResult> {
      guard(actor);
      if (!isRetentionKind(kind)) return refusedWith("Reload the page and try again.");
      let period: number | null = null;
      if (isAdjustable(kind)) {
        const keeping = await deps.recordKeeping(today());
        period = currentPolicies(await store.policies())[kind]?.period ?? defaultPeriod(kind, keeping);
        const range = periodRange(kind, keeping);
        if (period === null || "refused" in range) return refusedWith("refused" in range ? range.refused : "Set the period first.");
        if (period < range.min) return refusedWith(`Change the period first: it must be at least ${years(range.min)}, SARS's record-keeping period.`);
      }
      const version = await addPolicyVersion(actor, kind, period);
      if (version === null) return refusedWith("Someone changed this rule at the same moment. Reload the page.");
      const what = period === null ? "" : ` at ${kind === "guest-records" ? years(period) : months(period)}`;
      await record(actor, "privacy.retention-confirmed", `Confirmed the rule for ${retentionKindNames[kind].toLowerCase()}${what} (version ${version})`, {
        type: "retention-policy",
        id: kind,
      });
      return done();
    },

    /** For the daily job, with no one signed in. */
    maintenance: {
      /**
       * Applies the confirmed rules: anonymises inactive guests and deletes
       * old task photos. Idempotent (a second run finds nothing more to do).
       * Every run is kept and logged, as counts only.
       */
      async runRetention(): Promise<RetentionRunReport> {
        const { plan: next } = await plan();
        const skipped: string[] = [];
        let guestsAnonymised = 0;
        let photosDeleted = 0;
        if (next.guests.status === "ready") guestsAnonymised = await retention.anonymiseInactiveGuests(next.guests.cutoff, clock.now());
        else skipped.push(`${retentionKindNames["guest-records"]}: ${next.guests.reason}`);
        if (next.taskPhotos.status === "ready") photosDeleted = await retention.deleteTaskPhotos(next.taskPhotos.cutoff);
        else skipped.push(`${retentionKindNames["task-photos"]}: ${next.taskPhotos.reason}`);
        const report: RetentionRunReport = { guestsAnonymised, photosDeleted, skipped };
        const id = ids.newId();
        await store.addRun({ ...report, id, ranAt: clock.now() });
        await record(null, "privacy.retention-run", `Retention run: ${count(guestsAnonymised, "guest record")} anonymised, ${count(photosDeleted, "task photo")} deleted`, { type: "retention-run", id }, {
          ...report,
        });
        return report;
      },
    },

    /** For the public privacy notice, with no one signed in: only the officer's name and how to reach them. */
    notice: {
      async informationOfficer(): Promise<PublicInformationOfficer | null> {
        const officer = await store.officer();
        return officer ? { name: officer.name, email: officer.email, phone: officer.phone, registrationReference: officer.registrationReference } : null;
      },
    },
  };

  async function close(actor: Actor, id: string, status: "answered" | "refused", draft: { closedOn: IsoDate; outcome: string | null; revision: number }): Promise<ChangeResult> {
    const request = await store.request(id);
    if (!request || request.revision !== draft.revision || !isOpen(request.status)) return refusedWith(requestGone);
    if (compareIsoDates(draft.closedOn, today()) > 0) return refused({ closedOn: notInFuture });
    if (compareIsoDates(draft.closedOn, request.receivedOn) < 0) return refused({ closedOn: "Choose a day on or after the day you received it." });
    if (!(await saveRequest(request, { status, closedOn: draft.closedOn, outcome: draft.outcome }))) return refusedWith(requestGone);
    await record(actor, status === "answered" ? "privacy.request-answered" : "privacy.request-refused", `${status === "answered" ? "Answered" : "Refused"} a request on ${formatDateShort(draft.closedOn)}`, {
      type: "privacy-request",
      id,
    });
    return done();
  }
}

export type PrivacyService = ReturnType<typeof createPrivacyService>;

/** "an access", "a correction". */
function article(name: string): string {
  return `${/^[AEIOU]/.test(name) ? "an" : "a"} ${name.toLowerCase()}`;
}

function count(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? "" : "s"}`;
}

/** What changed on a breach, in words, for the activity log (never its details). */
function breachChanges(before: Breach, after: Breach): string {
  const changes: string[] = [];
  if (before.status !== after.status) changes.push(after.status === "contained" ? `marked contained${after.containedOn ? ` on ${formatDateShort(after.containedOn)}` : ""}` : "marked ongoing again");
  if (!before.regulatorToldOn && after.regulatorToldOn) changes.push(`Regulator told on ${formatDateShort(after.regulatorToldOn)}`);
  if (!before.peopleToldOn && after.peopleToldOn) changes.push(`people affected told on ${formatDateShort(after.peopleToldOn)}`);
  return changes.length > 0 ? changes.join("; ") : "details changed";
}
