import { addDays, compareIsoDates, type IsoDate } from "@/lib/format/zoned-time";
import { staysOverlap, type Stay } from "./stays";
import type { AvailabilityBlock, Unit } from "./units";

/**
 * Which apartments are free, worked out from units and blocks. Pure: the
 * service reads the records, these functions decide.
 *
 * An apartment type is:
 * - "free" when at least one of its active units has no block on any night
 *   of the stay;
 * - "full" when it has active units and every one is blocked on some night;
 * - "not-set-up" when it has no active units yet: the site can't tell, so a
 *   guest may still send a request and the owner checks by hand.
 *
 * What leaves the inventory for the public site is only this status per
 * apartment type (publicAvailability): never unit names, block reasons,
 * notes or who made them. That's the privacy boundary (the template's
 * allow-listed projection).
 */

export type ApartmentStatus = "free" | "full" | "not-set-up";

/** What the inventory needs to know about an apartment type from the site's content. */
export type OfferedApartment = { slug: string; sleeps: number };

/** The active units of one apartment type, in their order. */
export function unitsOf(apartment: string, units: readonly Unit[]): Unit[] {
  return units.filter((unit) => unit.active && unit.apartment === apartment).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

/** Whether `unit` has no block on any night of `stay`. */
export function isUnitFree(unit: Pick<Unit, "id">, stay: Stay, blocks: readonly AvailabilityBlock[]): boolean {
  return !blocks.some((block) => block.unitId === unit.id && staysOverlap(block.stay, stay));
}

/** The active units of `apartment` free for every night of `stay`, in their order. */
export function freeUnitsFor(apartment: string, stay: Stay, units: readonly Unit[], blocks: readonly AvailabilityBlock[]): Unit[] {
  return unitsOf(apartment, units).filter((unit) => isUnitFree(unit, stay, blocks));
}

/** An apartment type's status for `stay`. */
export function apartmentStatus(apartment: string, stay: Stay, units: readonly Unit[], blocks: readonly AvailabilityBlock[]): ApartmentStatus {
  const own = unitsOf(apartment, units);
  if (own.length === 0) return "not-set-up";
  return own.some((unit) => isUnitFree(unit, stay, blocks)) ? "free" : "full";
}

/** One apartment type on the Book page: its slug and status, nothing else. */
export type PublicApartmentAvailability = { slug: string; status: ApartmentStatus; fits: boolean };

/**
 * The public answer for a stay and a group: every offered apartment type,
 * whether it sleeps the group, and its status. Free apartments that fit come
 * first, then ones the site can't tell about, then full ones, then the ones
 * too small, each group in the content's order.
 */
export function publicAvailability(
  stay: Stay,
  guests: number,
  apartments: readonly OfferedApartment[],
  units: readonly Unit[],
  blocks: readonly AvailabilityBlock[],
): PublicApartmentAvailability[] {
  const rank = (entry: PublicApartmentAvailability) => (entry.fits ? { free: 0, "not-set-up": 1, full: 2 }[entry.status] : 3);
  return apartments
    .map((apartment, order) => ({
      order,
      entry: { slug: apartment.slug, status: apartmentStatus(apartment.slug, stay, units, blocks), fits: apartment.sleeps >= guests },
    }))
    .sort((a, b) => rank(a.entry) - rank(b.entry) || a.order - b.order)
    .map(({ entry }) => entry);
}

/** One night in an apartment's calendar. */
export type NightAvailability = { date: IsoDate; status: ApartmentStatus };

/**
 * An apartment type's nights from `from` up to `until`, each free, full or
 * not set up, for the calendar on its page. Public: statuses only.
 */
export function nightlyAvailability(
  apartment: string,
  from: IsoDate,
  until: IsoDate,
  units: readonly Unit[],
  blocks: readonly AvailabilityBlock[],
): NightAvailability[] {
  const nights: NightAvailability[] = [];
  for (let date = from; compareIsoDates(date, until) < 0; date = addDays(date, 1)) {
    nights.push({ date, status: apartmentStatus(apartment, { arrive: date, leave: addDays(date, 1) }, units, blocks) });
  }
  return nights;
}
