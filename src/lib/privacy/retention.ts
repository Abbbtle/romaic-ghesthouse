import { sessionPolicies } from "@/lib/accounts/sessions";
import { requestRetentionDays } from "@/lib/booking/retention";
import { visitorKeyRetentionMs } from "@/lib/booking/spam-rules";
import { addMonths, zonedDayBounds, type IsoDate } from "@/lib/format/zoned-time";
import { lookUp, type TaxParameter } from "@/lib/tax/parameters";

/**
 * The retention schedule (POPIA s14; build plan Phase 5): how long each kind
 * of record is kept and what happens after. Two rules run in the daily job
 * here, and only once the owner has confirmed them (anonymising and deleting
 * can't be undone, so a default never runs by itself):
 *
 * - guest records: a guest's name, phone, email and notes (and the notes on
 *   their bookings) are anonymised once they've had no stay, payment or
 *   invoice for a set number of years and nothing is booked. The period is
 *   at least SARS's record-keeping period, read from the verified tax
 *   parameter `records.keep-years` (never a number written here), because
 *   their bookings and invoices are financial records. The default adds a
 *   margin to it, since SARS counts from when a return is submitted.
 * - task photos: deleted a set number of months after their task was done
 *   (a default of 12, for the owner to confirm).
 *
 * The rest are listed so the schedule is whole, and run (or don't) where
 * they already do:
 * - booking requests: the booking module's own rule (src/lib/booking/retention.ts),
 *   applied by the daily "bookingRequests" task. Its numbers are read from
 *   there, not repeated;
 * - bookings, payments and invoices: kept (financial records). When a guest
 *   is anonymised the bookings stay, linked to the anonymised record;
 *   invoices already issued keep the name they were billed to;
 * - the activity (audit) log: append-only, never deleted by this job or
 *   anyone;
 * - visitor keys and dashboard sign-ins: the existing daily tasks.
 *
 * A policy is versioned: each change or confirmation is a new version, kept
 * for good, and audited. A kind with no version is on its default.
 */

export const retentionKinds = ["guest-records", "task-photos", "booking-requests", "bookings-invoices", "audit-log", "visitor-keys", "sessions"] as const;
export type RetentionKind = (typeof retentionKinds)[number];

export function isRetentionKind(value: unknown): value is RetentionKind {
  return typeof value === "string" && (retentionKinds as readonly string[]).includes(value);
}

export const retentionKindNames: Record<RetentionKind, string> = {
  "guest-records": "Guest records",
  "task-photos": "Task photos",
  "booking-requests": "Booking requests",
  "bookings-invoices": "Bookings, payments and invoices",
  "audit-log": "Activity log",
  "visitor-keys": "Visitor keys",
  sessions: "Dashboard sign-ins",
};

/** The kinds whose period the owner sets here, and its unit. */
export const adjustableKinds = { "guest-records": "years", "task-photos": "months" } as const satisfies Partial<Record<RetentionKind, "years" | "months">>;
export type AdjustableKind = keyof typeof adjustableKinds;

export function isAdjustable(kind: RetentionKind): kind is AdjustableKind {
  return Object.hasOwn(adjustableKinds, kind);
}

/** Years added to SARS's record-keeping period for the guest-record default: SARS counts from when a return is submitted, after the stay. A default to confirm. */
export const guestMarginYears = 2;

/** The longest guest-record period the form takes. */
export const guestMaxYears = 30;

/** Task photos: the default, a guess for the owner to confirm, and the range the form takes. */
export const taskPhotoDefaultMonths = 12;
export const taskPhotoMonthRange = { min: 1, max: 120 } as const;

/** One version of a kind's policy, as stored. Every version is the owner's own word: setting a period or confirming the default. */
export type RetentionPolicy = {
  id: string;
  kind: RetentionKind;
  /** 1, 2, 3…: per kind, in the order they were set. */
  version: number;
  /** Years for guest records, months for task photos; null for the kinds that aren't set here. */
  period: number | null;
  setBy: string;
  /** Their name at the time, for the schedule. */
  setByName: string;
  setAt: Date;
};

/** SARS's record-keeping period on a day, from the verified tax parameter, or why there isn't one. */
export type RecordKeeping =
  | { status: "verified"; years: number; sourceUrl: string; sourceTitle: string; checkedOn: IsoDate; note: string }
  | { status: "missing"; message: string };

/** SARS's record-keeping period on a day, from the tax parameters as stored: the verified value of `records.keep-years`, never a number of our own. */
export function recordKeepingFrom(parameters: readonly TaxParameter[], on: IsoDate): RecordKeeping {
  const found = lookUp(parameters, "records.keep-years", on);
  if (found.status !== "verified") return { status: "missing", message: found.message };
  const { sourceUrl, sourceTitle, checkedOn, note } = found.parameter;
  return { status: "verified", years: found.value, sourceUrl, sourceTitle, checkedOn, note };
}

/** Each kind's latest version, if any. */
export function currentPolicies(policies: readonly RetentionPolicy[]): Partial<Record<RetentionKind, RetentionPolicy>> {
  const current: Partial<Record<RetentionKind, RetentionPolicy>> = {};
  for (const policy of policies) {
    const held = current[policy.kind];
    if (!held || policy.version > held.version) current[policy.kind] = policy;
  }
  return current;
}

/** The default period for an adjustable kind; null for guest records while SARS's period isn't verified. */
export function defaultPeriod(kind: AdjustableKind, keeping: RecordKeeping): number | null {
  if (kind === "task-photos") return taskPhotoDefaultMonths;
  return keeping.status === "verified" ? keeping.years + guestMarginYears : null;
}

/** The periods the form accepts for a kind, or why none can be set yet. */
export function periodRange(kind: AdjustableKind, keeping: RecordKeeping): { min: number; max: number } | { refused: string } {
  if (kind === "task-photos") return taskPhotoMonthRange;
  if (keeping.status !== "verified") return { refused: unverifiedKeeping };
  return { min: keeping.years, max: Math.max(guestMaxYears, keeping.years) };
}

const unverifiedKeeping = "SARS's record-keeping period isn't verified, so guest records can't be checked against it. Add a verified version under Tax › Rates and dates.";

const waitingForOwner = "Waiting for you to confirm the period.";

/** A rule as the next run would apply it: ready (confirmed), or waiting with the reason, and its cut-off when the period is known. */
export type RulePlan<Cutoff> =
  | { status: "ready"; period: number; cutoff: Cutoff }
  | { status: "waiting"; period: number | null; cutoff: Cutoff | null; reason: string };

export type RetentionPlan = {
  /** Guests with no stay, payment or invoice on or after this day (and nothing booked) are anonymised. */
  guests: RulePlan<IsoDate>;
  /** Photos on tasks done before this instant are deleted. */
  taskPhotos: RulePlan<Date>;
};

/**
 * What the next run does, from the policies, SARS's verified period and
 * today's date (in the business's time zone). Pure: the service runs it,
 * and the preview shows it.
 */
export function planRetention({
  policies,
  keeping,
  today,
  timeZone,
}: {
  policies: readonly RetentionPolicy[];
  keeping: RecordKeeping;
  today: IsoDate;
  timeZone: string;
}): RetentionPlan {
  const current = currentPolicies(policies);
  const guestCutoff = (years: number) => addMonths(today, -12 * years);
  const photoCutoff = (months: number) => zonedDayBounds(addMonths(today, -months), timeZone).start;

  let guests: RulePlan<IsoDate>;
  const guestPolicy = current["guest-records"];
  if (keeping.status !== "verified") {
    guests = { status: "waiting", period: guestPolicy?.period ?? null, cutoff: null, reason: unverifiedKeeping };
  } else if (!guestPolicy || guestPolicy.period === null) {
    const period = defaultPeriod("guest-records", keeping)!;
    guests = { status: "waiting", period, cutoff: guestCutoff(period), reason: waitingForOwner };
  } else if (guestPolicy.period < keeping.years) {
    guests = {
      status: "waiting",
      period: guestPolicy.period,
      cutoff: null,
      reason: `Your period of ${years(guestPolicy.period)} is shorter than SARS's record-keeping period (${years(keeping.years)}). Change it to at least ${years(keeping.years)}.`,
    };
  } else {
    guests = { status: "ready", period: guestPolicy.period, cutoff: guestCutoff(guestPolicy.period) };
  }

  const photoPolicy = current["task-photos"];
  const taskPhotos: RulePlan<Date> =
    photoPolicy && photoPolicy.period !== null
      ? { status: "ready", period: photoPolicy.period, cutoff: photoCutoff(photoPolicy.period) }
      : { status: "waiting", period: taskPhotoDefaultMonths, cutoff: photoCutoff(taskPhotoDefaultMonths), reason: waitingForOwner };

  return { guests, taskPhotos };
}

export const years = (count: number) => (count === 1 ? "1 year" : `${count} years`);
export const months = (count: number) => (count === 1 ? "1 month" : `${count} months`);

const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;

/** One row of the schedule page: what's kept, the rule in words, what applies it, and whether the owner has confirmed it. */
export type ScheduleRow = {
  kind: RetentionKind;
  name: string;
  /** The rule as it stands (the confirmed period, or the default). */
  rule: string;
  /** What applies it. */
  appliedBy: string;
  /** For adjustable kinds: the unit, the period in force (or the default), and the range allowed. */
  adjustable: { unit: "years" | "months"; period: number | null; isDefault: boolean; range: { min: number; max: number } | { refused: string } } | null;
  /** The latest version, when the owner has set or confirmed it. */
  confirmed: Pick<RetentionPolicy, "version" | "setAt" | "setByName" | "period"> | null;
  /** A note under the rule, such as why the default is what it is. */
  note: string | null;
};

/** The whole schedule, in the order the page lists it. */
export function retentionSchedule(policies: readonly RetentionPolicy[], keeping: RecordKeeping): ScheduleRow[] {
  const current = currentPolicies(policies);
  const confirmed = (kind: RetentionKind) => {
    const policy = current[kind];
    return policy ? { version: policy.version, setAt: policy.setAt, setByName: policy.setByName, period: policy.period } : null;
  };
  const sarsYears = keeping.status === "verified" ? years(keeping.years) : null;
  const staffDays = Math.max(sessionPolicies.owner.absoluteMs, sessionPolicies.sales.absoluteMs, sessionPolicies.staff.absoluteMs) / dayMs;
  const adminHours = sessionPolicies.admin.absoluteMs / hourMs;

  const guestPeriod = current["guest-records"]?.period ?? defaultPeriod("guest-records", keeping);
  const photoPeriod = current["task-photos"]?.period ?? taskPhotoDefaultMonths;

  return [
    {
      kind: "guest-records",
      name: retentionKindNames["guest-records"],
      rule:
        guestPeriod === null
          ? "A guest's name, phone number, email and notes, and the notes on their bookings, are anonymised once they've had no stay, payment or invoice for a set number of years and nothing is booked. The period can't be set until SARS's record-keeping period is verified."
          : `A guest's name, phone number, email and notes, and the notes on their bookings, are anonymised once they've had no stay, payment or invoice for ${years(guestPeriod)} and nothing is booked or under way. Their bookings and invoices stay.`,
      appliedBy: "The daily job, once you confirm the period.",
      adjustable: { unit: "years", period: guestPeriod, isDefault: !current["guest-records"], range: periodRange("guest-records", keeping) },
      confirmed: confirmed("guest-records"),
      note:
        keeping.status === "verified"
          ? `At least SARS's record-keeping period (${sarsYears}). The default adds ${years(guestMarginYears)}, because SARS counts from when a return is submitted, which comes after the stay. Check the period with your accountant.`
          : unverifiedKeeping,
    },
    {
      kind: "task-photos",
      name: retentionKindNames["task-photos"],
      rule: `Photos on finished tasks are deleted ${months(photoPeriod)} after the task was done. The task itself stays.`,
      appliedBy: "The daily job, once you confirm the period.",
      adjustable: { unit: "months", period: photoPeriod, isDefault: !current["task-photos"], range: taskPhotoMonthRange },
      confirmed: confirmed("task-photos"),
      note: current["task-photos"] ? null : `${months(taskPhotoDefaultMonths)} is a default, not a rule: choose what suits you.`,
    },
    {
      kind: "booking-requests",
      name: retentionKindNames["booking-requests"],
      rule: `A request still waiting expires on its arrival day. Declined and expired requests are deleted ${requestRetentionDays} days after the decision, and accepted ones ${requestRetentionDays} days after the stay ends.`,
      appliedBy: "The daily clean-up of booking requests. Changing the period needs Weberu.",
      adjustable: null,
      confirmed: confirmed("booking-requests"),
      note: null,
    },
    {
      kind: "bookings-invoices",
      name: retentionKindNames["bookings-invoices"],
      rule: `Kept: they're financial records, and the daily job never deletes them.${sarsYears ? ` SARS's record-keeping period is ${sarsYears}, counted from when a return is submitted.` : " SARS's record-keeping period isn't verified yet."} When a guest is anonymised, their bookings stay, linked to the anonymised record, and invoices already issued keep the name they were billed to.`,
      appliedBy: "Never deleted.",
      adjustable: null,
      confirmed: confirmed("bookings-invoices"),
      note: null,
    },
    {
      kind: "audit-log",
      name: retentionKindNames["audit-log"],
      rule: "Kept: no entry can be changed or deleted, by the daily job or anyone. Some entries name a guest, such as a change to their booking. Entries about privacy never do.",
      appliedBy: "Never deleted.",
      adjustable: null,
      confirmed: confirmed("audit-log"),
      note: null,
    },
    {
      kind: "visitor-keys",
      name: retentionKindNames["visitor-keys"],
      rule: `The scrambled form of a visitor's internet address, kept with a booking request to slow down spam, is forgotten at the first daily clean-up once it's ${visitorKeyRetentionMs / hourMs} hours old.`,
      appliedBy: "The daily clean-up of booking requests.",
      adjustable: null,
      confirmed: confirmed("visitor-keys"),
      note: null,
    },
    {
      kind: "sessions",
      name: retentionKindNames.sessions,
      rule: `A sign-in to the dashboard ends after a set time without use, and after ${staffDays} days at most (${adminHours} hours for admins). The daily job deletes ended sign-ins, and password-reset and email links once they expire.`,
      appliedBy: "The daily clean-up of sign-ins and links.",
      adjustable: null,
      confirmed: confirmed("sessions"),
      note: null,
    },
  ];
}

/** What a run did: counts and the reasons rules were skipped, never anyone's details. */
export type RetentionRunReport = { guestsAnonymised: number; photosDeleted: number; skipped: string[] };

/** A run as kept for the schedule page. */
export type RetentionRun = RetentionRunReport & { id: string; ranAt: Date };
