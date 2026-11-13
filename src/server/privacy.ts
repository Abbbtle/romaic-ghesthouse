import "server-only";
import { connection } from "next/server";
import { createPostgresInventoryStore } from "@/adapters/postgres/inventory-store";
import { createPostgresPrivacyStore, createPostgresRetentionStore } from "@/adapters/postgres/privacy-store";
import { createPostgresReservationStore } from "@/adapters/postgres/reservation-store";
import { createPostgresTaxStore } from "@/adapters/postgres/tax-store";
import { assertCan, can } from "@/lib/accounts/access";
import { businessTimeZone } from "@/lib/format/zoned-time";
import type { GuestRecords } from "@/lib/privacy/ports";
import type { PublicInformationOfficer } from "@/lib/privacy/privacy";
import { createPrivacyService, type PrivacyService } from "@/lib/privacy/privacy-service";
import { recordKeepingFrom, type RetentionRunReport } from "@/lib/privacy/retention";
import { auditRecorder } from "./audit";
import { contentService } from "./content";
import { clock, database, fieldCipher, ids } from "./infrastructure";

/**
 * POPIA as the site uses it: the request log, breach register, Information
 * Officer and retention policies in Postgres; guests and bookings read
 * through the reservations core's store (its guest search included);
 * requesters' contacts sealed with DATA_ENCRYPTION_KEY, each bound to its
 * request; SARS's record-keeping period read from the verified tax
 * parameter; permissions from the accounts core (owner only); every change
 * in the activity log under "privacy", never with a name or contact in it.
 */

let privacy: PrivacyService | null = null;

function guestRecords(): GuestRecords {
  const reservations = createPostgresReservationStore(database());
  return {
    searchGuests: (query, limit) => reservations.searchGuests(query, limit),
    guest: (id) => reservations.guest(id),
    bookingsForGuest: (guestId) => reservations.bookingsForGuest(guestId),
  };
}

/** Apartment names by slug (from the content as it is now) and unit names by id, for the guest export. */
async function names(): Promise<{ apartments: Record<string, string>; units: Record<string, string> }> {
  const [content, units] = await Promise.all([contentService().getAll(), createPostgresInventoryStore(database()).units()]);
  return {
    apartments: Object.fromEntries(content.apartments.items.map((item) => [item.slug, item.name])),
    units: Object.fromEntries(units.map((unit) => [unit.id, unit.name])),
  };
}

export function privacyService(): PrivacyService {
  privacy ??= createPrivacyService({
    store: createPostgresPrivacyStore(database()),
    retention: createPostgresRetentionStore(database()),
    guests: guestRecords(),
    vault: {
      seal: (plaintext, context) => fieldCipher().encrypt(plaintext, context),
      open: (sealed, context) => fieldCipher().decrypt(sealed, context),
    },
    recordKeeping: async (on) => recordKeepingFrom(await createPostgresTaxStore(database()).parameters(), on),
    names,
    clock,
    ids,
    audit: auditRecorder(),
    access: { can, assertCan },
    timeZone: businessTimeZone,
  });
  return privacy;
}

/** The daily job's retention run (src/server/daily-maintenance.ts): counts only, as the job's summary shows. */
export function runPrivacyRetention(): Promise<RetentionRunReport> {
  return privacyService().maintenance.runRetention();
}

/**
 * The Information Officer's name and how to reach them, for the public
 * privacy notice, or null while the owner hasn't set them: the notice
 * (src/app/(site)/privacy/page.tsx) then shows a marked gap, never a name of
 * our own.
 */
export async function publicInformationOfficer(): Promise<PublicInformationOfficer | null> {
  // The public privacy page reads this beside getSiteContent(): wait for the request, so it's never baked into a prerendered page.
  await connection();
  return privacyService().notice.informationOfficer();
}

/** The response for a guest's export: a CSV download, never cached or shown as a page. */
export function guestExportResponse(file: { fileName: string; csv: string } | null): Response {
  const noStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (!file) return new Response("Not found", { status: 404, headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(file.csv, {
    headers: { ...noStore, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file.fileName}"` },
  });
}
