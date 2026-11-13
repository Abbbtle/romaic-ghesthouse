import { parsePhoneNumber } from "@/lib/format/phone";
import { compareIsoDates, addDays, type IsoDate } from "@/lib/format/zoned-time";

/**
 * POPIA in the dashboard (build plan, Phase 5): requests from people about
 * their personal information (data-subject requests), the breach register,
 * the Information Officer's details and the retention schedule
 * (./retention.ts). Owner only (privacy:requests, roles.md): admins
 * (Weberu) never see guests' personal information, and nor do sales or
 * staff here.
 *
 * Nothing in this module states a legal timeframe of its own. Where the
 * pages quote the Act or the Information Regulator, ./sources.ts says where
 * and when it was read.
 */

// --- data-subject requests ---------------------------------------------------------

export const requestKinds = ["access", "correction", "deletion", "objection", "other"] as const;
export type RequestKind = (typeof requestKinds)[number];

export const requestKindNames: Record<RequestKind, string> = {
  access: "Access",
  correction: "Correction",
  deletion: "Deletion",
  objection: "Objection",
  other: "Other",
};

/** What each kind means, in the owner's words, for the form's choices. */
export const requestKindHelp: Record<RequestKind, string> = {
  access: "They want to know what you hold about them, or a copy of it.",
  correction: "They want something you hold about them corrected.",
  deletion: "They want what you hold about them deleted.",
  objection: "They object to how you use their information, such as for marketing.",
  other: "Anything else about their personal information.",
};

export const requestStatuses = ["received", "in-progress", "answered", "refused"] as const;
export type RequestStatus = (typeof requestStatuses)[number];

export const requestStatusNames: Record<RequestStatus, string> = {
  received: "Received",
  "in-progress": "In progress",
  answered: "Answered",
  refused: "Refused",
};

/** Whether a request still needs an answer. */
export function isOpen(status: RequestStatus): boolean {
  return status === "received" || status === "in-progress";
}

/** A request as stored. The requester's contact is sealed (encrypted, bound to the request's id); only a masked hint is kept in the clear. */
export type DataSubjectRequest = {
  id: string;
  kind: RequestKind;
  /** How they named themselves. Kept short: only what's needed to know who asked. */
  requesterName: string;
  /** Their email, phone or other contact, sealed with the data key; null when they gave none. */
  contactSealed: string | null;
  /** The contact masked for lists: "t•••@example.com", "Phone ending 4567". */
  contactHint: string | null;
  receivedOn: IsoDate;
  /** Set by the owner: sections 23 and 24 of the Act give no number of days (see ./sources.ts), so there's no default. */
  dueOn: IsoDate;
  status: RequestStatus;
  /** What they asked for, in a line or two. */
  details: string | null;
  notes: string | null;
  /** The guest record it's about, once found. */
  guestId: string | null;
  /** When the owner was satisfied the requester is who they say (POPIA s23(1) asks for "adequate proof of identity"). */
  identityConfirmedOn: IsoDate | null;
  identityNote: string | null;
  /** When it was answered or refused. */
  closedOn: IsoDate | null;
  /** What was done, or why it was refused (required for a refusal). */
  outcome: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Goes up with every change; a change is accepted only over the revision the editor started from. */
  revision: number;
};

/** A request as the pages see it: never the sealed contact. */
export type RequestView = Omit<DataSubjectRequest, "contactSealed"> & { hasContact: boolean };

export function viewOf(request: DataSubjectRequest): RequestView {
  const { contactSealed, ...rest } = request;
  return { ...rest, hasContact: contactSealed !== null };
}

/** The app's own early warning, not a legal period: a request due within this many days counts as "due soon". */
export const dueSoonDays = 7;

export type Urgency = "overdue" | "due-soon" | "on-time" | "closed";

export function urgencyOf(request: Pick<DataSubjectRequest, "status" | "dueOn">, today: IsoDate): Urgency {
  if (!isOpen(request.status)) return "closed";
  if (compareIsoDates(request.dueOn, today) < 0) return "overdue";
  if (compareIsoDates(request.dueOn, addDays(today, dueSoonDays)) <= 0) return "due-soon";
  return "on-time";
}

/** Open requests first (overdue, then soonest due), then closed ones, most recently closed first. */
export function byUrgency<T extends Pick<DataSubjectRequest, "status" | "dueOn" | "closedOn" | "createdAt">>(requests: readonly T[]): T[] {
  return [...requests].sort((a, b) => {
    const openA = isOpen(a.status);
    const openB = isOpen(b.status);
    if (openA !== openB) return openA ? -1 : 1;
    if (openA) return compareIsoDates(a.dueOn, b.dueOn) || a.createdAt.getTime() - b.createdAt.getTime();
    return compareIsoDates(b.closedOn ?? "", a.closedOn ?? "") || b.createdAt.getTime() - a.createdAt.getTime();
  });
}

/**
 * A requester's contact as it's stored: a phone number in E.164, an email
 * address in lower case, or anything else (a postal address) trimmed.
 */
export function normalisedContact(text: string): string {
  const trimmed = text.trim();
  const phone = parsePhoneNumber(trimmed);
  if (phone.ok) return phone.e164;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return trimmed.toLowerCase();
  return trimmed;
}

/** A contact masked for lists and pages, so it's never shown whole by default. */
export function maskedContact(contact: string): string {
  if (/^\+[1-9][0-9]{6,14}$/.test(contact)) return `Phone ending ${contact.slice(-4)}`;
  const at = contact.lastIndexOf("@");
  if (at > 0) return `${contact.slice(0, 1)}•••${contact.slice(at)}`;
  return `${contact.slice(0, 2)}••• (${contact.length} characters)`;
}

/** Where a request's contact is sealed: the ciphertext opens only for this request. */
export function contactContext(requestId: string): string {
  return `privacy-request-contact:${requestId}`;
}

// --- the breach register -------------------------------------------------------------

export const breachStatuses = ["ongoing", "contained"] as const;
export type BreachStatus = (typeof breachStatuses)[number];

export const breachStatusNames: Record<BreachStatus, string> = {
  ongoing: "Ongoing",
  contained: "Contained",
};

/** A security compromise, as the owner records it. Kept for good: the register can't lose an entry. */
export type Breach = {
  id: string;
  discoveredOn: IsoDate;
  /** What happened. */
  summary: string;
  /** What personal information was involved. */
  dataInvolved: string;
  /** How many people, when known. */
  peopleAffected: number | null;
  status: BreachStatus;
  containedOn: IsoDate | null;
  /** When the Information Regulator was told, if it was. */
  regulatorToldOn: IsoDate | null;
  /** The reference the Regulator's portal gave, if any. */
  regulatorReference: string | null;
  /** When the people affected were told, if they were. */
  peopleToldOn: IsoDate | null;
  /** How they were told: "Email to each guest". */
  peopleToldHow: string | null;
  /** What's been done about it. */
  actions: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  revision: number;
};

/** What's still to do on a breach, in words, for its row: nothing when it's contained and both have been told. */
export function breachToDo(breach: Pick<Breach, "status" | "regulatorToldOn" | "peopleToldOn">): string[] {
  const steps: string[] = [];
  if (breach.status === "ongoing") steps.push("Not contained yet");
  if (!breach.regulatorToldOn) steps.push("Regulator not told");
  if (!breach.peopleToldOn) steps.push("People affected not told");
  return steps;
}

/** Newest discovery first. */
export function byDiscovery<T extends Pick<Breach, "discoveredOn" | "createdAt">>(breaches: readonly T[]): T[] {
  return [...breaches].sort((a, b) => compareIsoDates(b.discoveredOn, a.discoveredOn) || b.createdAt.getTime() - a.createdAt.getTime());
}

// --- the Information Officer ---------------------------------------------------------

/** Who answers for personal information at the business (POPIA s55). The owner sets it; until then nothing is shown as a name. */
export type InformationOfficer = {
  name: string;
  email: string;
  /** E.164, or null. */
  phone: string | null;
  /** The reference the Information Regulator gave when the officer was registered, if any. */
  registrationReference: string | null;
  updatedAt: Date;
  updatedBy: string | null;
};

/** What the public privacy notice may show of the officer: their name and how to reach them. */
export type PublicInformationOfficer = Pick<InformationOfficer, "name" | "email" | "phone" | "registrationReference">;

// --- guests, as a request about them needs them ---------------------------------------

/** What a guest record is replaced with when it's anonymised. Never a real name. */
export const anonymisedGuestName = "Anonymised guest";

/** Booking states that mean a stay is still to come or under way: a guest with one can't be anonymised. */
export const activeStayStatuses = ["confirmed", "checked-in"] as const;
