import "server-only";
import { connection } from "next/server";
import { createPostgresRateStore } from "@/adapters/postgres/rate-store";
import { assertCan, can } from "@/lib/accounts/access";
import type { Stay } from "@/lib/inventory/stays";
import { createRateService, type RatedApartment, type RateService } from "@/lib/rates/rate-service";
import type { Quote } from "@/lib/rates/rates";
import { auditRecorder } from "./audit";
import { contentService } from "./content";
import { clock, database, ids } from "./infrastructure";

/**
 * The rates as the site uses them: plans and seasons in Postgres, the
 * apartment types from the site's content, permissions from the accounts
 * core, every change in the audit log. Public pages and the reservations
 * service ask it for prices; until someone sets a rate, there's none, and
 * the site says "Price on request".
 */

async function apartmentTypes(): Promise<RatedApartment[]> {
  const { apartments } = await contentService().getAll();
  return apartments.items.map((item) => ({ slug: item.slug, name: item.name, sleeps: item.sleeps }));
}

let service: RateService | null = null;

export function rateService(): RateService {
  service ??= createRateService({
    store: createPostgresRateStore(database()),
    apartmentTypes,
    clock,
    ids,
    audit: auditRecorder(),
    access: { can, assertCan },
  });
  return service;
}

/** The rates' price for a stay in cents, or null when there's no rate for it. Used to prefill a booking's total. */
export async function quoteStay(apartment: string, stay: Stay, guests: number): Promise<number | null> {
  return (await rateService().quote(apartment, stay, guests))?.totalCents ?? null;
}

/**
 * The full quote for a stay (total, nights, minimum stay), for the Book page.
 * Public pages call these beside getSiteContent(), so each waits for the
 * request itself (`connection()`): rates change in the dashboard at any
 * time and are never baked into a prerendered page.
 */
export async function publicQuote(apartment: string, stay: Stay, guests: number): Promise<Quote | null> {
  await connection();
  return rateService().quote(apartment, stay, guests);
}

/** Each apartment's nightly price in cents, for "From R800 a night", for the apartments with a rate in use. */
export async function nightlyFromPrices(): Promise<Record<string, number>> {
  await connection();
  return rateService().fromPrices();
}
