import type { IsoDate } from "@/lib/format/zoned-time";
import type { Actor } from "@/lib/kernel/actor";
import type { Booking, Guest } from "@/lib/reservations/reservations";
import type { Breach, DataSubjectRequest, InformationOfficer } from "./privacy";
import type { RecordKeeping, RetentionPolicy, RetentionRun } from "./retention";

/**
 * What the privacy core needs from the outside world. Adapters implement
 * these (Postgres in src/adapters/postgres/privacy-store.ts; in-memory ones
 * in ./testing); src/server wires them in.
 */

/**
 * The registers: data-subject requests and breaches (never deleted: a
 * register keeps every entry), the Information Officer's details, retention
 * policy versions and the runs of the retention job (both append-only).
 */
export interface PrivacyStore {
  /** Every request, newest first. */
  requests(): Promise<DataSubjectRequest[]>;
  request(id: string): Promise<DataSubjectRequest | null>;
  addRequest(request: DataSubjectRequest): Promise<void>;
  /** Stores the request as given, over `expectedRevision` only (the stored revision becomes `request.revision`). False when it changed or is gone. */
  updateRequest(request: DataSubjectRequest, expectedRevision: number): Promise<boolean>;

  /** Every breach, newest first. */
  breaches(): Promise<Breach[]>;
  breach(id: string): Promise<Breach | null>;
  addBreach(breach: Breach): Promise<void>;
  updateBreach(breach: Breach, expectedRevision: number): Promise<boolean>;

  officer(): Promise<InformationOfficer | null>;
  saveOfficer(officer: InformationOfficer): Promise<void>;

  /** Every version of every policy. */
  policies(): Promise<RetentionPolicy[]>;
  /** Adds a version; "version-taken" when that kind already has that version (someone saved at the same moment). */
  addPolicy(policy: RetentionPolicy): Promise<"added" | "version-taken">;

  /** The latest runs, newest first. */
  runs(limit: number): Promise<RetentionRun[]>;
  addRun(run: RetentionRun): Promise<void>;
}

/** What anonymising one guest on request came to. */
export type GuestAnonymising =
  | { status: "anonymised"; bookingsCleared: number; requestsDeleted: number }
  | { status: "missing" }
  | { status: "already" }
  /** They have a stay booked or under way (confirmed or checked in): nothing changed. */
  | { status: "active-stay" };

/**
 * The retention job's reach into guests and task photos. Each write is one
 * transaction, idempotent: anonymising skips a guest already anonymised,
 * deleting finds fewer photos the second time. Financial records (bookings,
 * payments, invoices) are never deleted or rewritten here; a booking keeps
 * its guest link, and only its free-text notes are cleared.
 */
export interface RetentionStore {
  /** Guests not anonymised, with nothing booked or under way, whose last stay, payment, invoice (or the record itself) is before `before`. */
  countInactiveGuests(before: IsoDate): Promise<number>;
  /** Anonymises those guests (name, phone, email, notes; their bookings' notes); answers how many. */
  anonymiseInactiveGuests(before: IsoDate, at: Date): Promise<number>;
  /** Photos on tasks done before `doneBefore`. */
  countTaskPhotos(doneBefore: Date): Promise<number>;
  /** Deletes those photos (the files and their place on the task); answers how many. */
  deleteTaskPhotos(doneBefore: Date): Promise<number>;
  /**
   * Anonymises one guest on request, refusing while they have a stay booked
   * or under way. Also clears their bookings' notes and deletes handled
   * booking requests that became their bookings (the rest of the request's
   * copy of their details).
   */
  anonymiseGuest(guestId: string, at: Date): Promise<GuestAnonymising>;
  /** When a guest was anonymised, or null (also for a guest that doesn't exist). */
  anonymisedAt(guestId: string): Promise<Date | null>;
}

/** Guests and their bookings, read through the reservations core's store (its guest search, record and bookings). */
export interface GuestRecords {
  /** Guests whose name, phone or email matches `query` (case-insensitive). */
  searchGuests(query: string, limit: number): Promise<Guest[]>;
  guest(id: string): Promise<Guest | null>;
  bookingsForGuest(guestId: string): Promise<Booking[]>;
}

/** Seals and opens a requester's contact with the data key, bound to its request (src/adapters/crypto/field-encryption.ts). */
export interface ContactVault {
  seal(plaintext: string, context: string): string;
  /** Throws when the value was altered, belongs to another request, or its key is gone. */
  open(sealed: string, context: string): string;
}

/** SARS's record-keeping period on a day, from the verified tax parameter (src/lib/tax). */
export type RecordKeepingSource = (on: IsoDate) => Promise<RecordKeeping>;

export type PrivacyPermission = "privacy:requests";

export interface PrivacyAccess {
  can(actor: Actor, permission: PrivacyPermission): boolean;
  assertCan(actor: Actor, permission: PrivacyPermission): void;
}
