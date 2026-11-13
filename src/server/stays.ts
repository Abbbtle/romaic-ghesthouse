import "server-only";
import { createFormTokens } from "@/adapters/crypto/form-tokens";
import { cryptoRandom } from "@/adapters/crypto/random-source";
import { createPostgresBookingStore } from "@/adapters/postgres/booking-store";
import { createPostgresInventoryStore } from "@/adapters/postgres/inventory-store";
import { assertCan, can } from "@/lib/accounts/access";
import { createBookingService, type BookingService } from "@/lib/booking/booking-service";
import { requestRateLimits } from "@/lib/booking/spam-rules";
import { businessTimeZone } from "@/lib/format/zoned-time";
import { createInventoryService, type ApartmentType, type InventoryService } from "@/lib/inventory/inventory-service";
import { createReservationService, type ReservationService } from "@/lib/reservations/reservation-service";
import { createPostgresReservationStore } from "@/adapters/postgres/reservation-store";
import { publicQuote, quoteStay } from "./rates";
import { syncBookingLedger } from "./ledger";
import { afterCheckOut } from "./tasks";
import { dashboardOrigin } from "./accounts";
import { auditRecorder } from "./audit";
import { contentService } from "./content";
import { clock, database, emailSender, ids, rateLimiter, reportError, runAfterResponse, signedTokens } from "./infrastructure";

/**
 * The inventory and booking-request services as the site uses them: units,
 * blocks and requests in Postgres; the apartment types, consent versions and
 * alert address from the site's content; permissions from the accounts
 * core; every change in the audit log. Made on first use and kept per
 * module, like the account and content services.
 */

/** The dashboard's requests page, for the alert email. */
export const requestsPath = "/admin/requests";

/** The apartment types as the inventory sees them, read from the content as it is now. */
async function apartmentTypes(): Promise<ApartmentType[]> {
  const { apartments } = await contentService().getAll();
  return apartments.items.map((item) => ({ slug: item.slug, name: item.name, sleeps: item.sleeps, published: item.published }));
}

let inventory: InventoryService | null = null;
let booking: BookingService | null = null;
let reservations: ReservationService | null = null;

export function inventoryService(): InventoryService {
  inventory ??= createInventoryService({
    store: createPostgresInventoryStore(database()),
    apartmentTypes,
    clock,
    ids,
    audit: auditRecorder(),
    access: { can, assertCan },
    timeZone: businessTimeZone,
  });
  return inventory;
}

export function bookingService(): BookingService {
  booking ??= createBookingService({
    requests: createPostgresBookingStore(database()),
    inventory: inventoryService(),
    formTokens: createFormTokens(signedTokens("booking-form")),
    limits: {
      perHour: rateLimiter(requestRateLimits.perHour),
      perDay: rateLimiter(requestRateLimits.perDay),
      siteWide: rateLimiter(requestRateLimits.siteWide),
    },
    random: cryptoRandom,
    consentVersions: async () => {
      const { book, privacy } = await contentService().getAll();
      return { consent: book.consent.version, notice: privacy.version };
    },
    email: emailSender(),
    alertAddress: async () => (await contentService().getAll()).contact.email,
    minimumNights: async (apartment, stay, guests) => {
      const quote = await publicQuote(apartment, { arrive: stay.arrive, leave: stay.leave }, guests);
      return quote && !quote.meetsMinimum ? quote.minNights : null;
    },
    runAfterResponse: (task) => runAfterResponse(task, "The new-request alert failed"),
    reportProblem: (message) => reportError(message, new Error(message)),
    requestsPageUrl: `${dashboardOrigin()}${requestsPath}`,
    clock,
    ids,
    audit: auditRecorder(),
    access: { can, assertCan },
  });
  return booking;
}

/** The apartment types' names by slug, from the content as it is now. */
async function apartmentNames(): Promise<Record<string, string>> {
  return Object.fromEntries((await apartmentTypes()).map((type) => [type.slug, type.name]));
}

/** Bookings and guests: the dashboard's reservations, with prices from the rates and the clean after each check-out. */
export function reservationService(): ReservationService {
  reservations ??= createReservationService({
    store: createPostgresReservationStore(database()),
    inventory: createPostgresInventoryStore(database()),
    requests: createPostgresBookingStore(database()),
    quote: quoteStay,
    apartmentNames,
    // The clean for the unit and the stay's income in the books: each runs whatever happens to the other.
    onCheckedOut: async (booking) => {
      const [cleaning] = await Promise.allSettled([afterCheckOut(booking), syncBookingLedger(booking.id)]);
      if (cleaning.status === "rejected") throw cleaning.reason;
    },
    reportProblem: (message) => reportError(message, new Error(message)),
    random: cryptoRandom,
    clock,
    ids,
    audit: auditRecorder(),
    access: { can, assertCan },
    timeZone: businessTimeZone,
  });
  return reservations;
}

/** Every unit, for forms and names in the dashboard. Pages that show them check their own permission first. */
export function allUnits() {
  return createPostgresInventoryStore(database()).units();
}
