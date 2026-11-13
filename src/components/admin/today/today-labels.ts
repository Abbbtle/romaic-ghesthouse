import { formatDayShort } from "@/lib/format/date-time";
import { nightsLabel } from "@/lib/inventory/stays";
import type { StaffStay, TodayStay } from "@/lib/reservations/reservation-service";
import { adminRoutes } from "../admin-routes";

/**
 * A stay as a Today row shows it. Built on the server from what the
 * person may see: from a whole booking for the owner and sales, and from
 * staff's limited view (name, unit, dates, service notes) for staff, so
 * nothing else reaches the browser.
 */
export type StayRow = {
  id: string;
  guestName: string;
  unitName: string;
  /** "Unit 2 · Family room with shower", or just the unit for staff. */
  place: string;
  /** "3 nights, leaving Sun 15 Nov". */
  when: string;
  /** "2 adults, 1 child", for the owner and sales. */
  guests: string | null;
  serviceNotes: string | null;
  /** The booking's page, for those who may open it. */
  href: string | null;
};

export type StayPart = "arriving" | "leaving" | "staying";

function whenOf(stay: { arrive: string; leave: string }, part: StayPart): string {
  switch (part) {
    case "arriving":
      return `${nightsLabel(stay)}, leaving ${formatDayShort(stay.leave)}`;
    case "leaving":
      return `Arrived ${formatDayShort(stay.arrive)}, ${nightsLabel(stay)}`;
    case "staying":
      return `Leaving ${formatDayShort(stay.leave)}`;
  }
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function guestsLabel(adults: number, children: number): string {
  return children > 0 ? `${plural(adults, "adult", "adults")}, ${plural(children, "child", "children")}` : plural(adults, "adult", "adults");
}

/** A stay for the owner or sales: the booking whole, linked to its page. Only what the row shows is kept. */
export function fullStayRow(stay: TodayStay, part: StayPart): StayRow {
  return {
    id: stay.id,
    guestName: stay.guest.name,
    unitName: stay.unitName,
    place: `${stay.unitName} · ${stay.apartmentName}`,
    when: whenOf(stay.stay, part),
    guests: guestsLabel(stay.adults, stay.children),
    serviceNotes: stay.serviceNotes,
    href: `${adminRoutes.bookings}/${stay.id}`,
  };
}

/** A stay for staff, from their limited view only. */
export function staffStayRow(stay: StaffStay, part: StayPart): StayRow {
  return {
    id: stay.id,
    guestName: stay.guestName,
    unitName: stay.unitName,
    place: stay.unitName,
    when: whenOf(stay.stay, part),
    guests: null,
    serviceNotes: stay.serviceNotes,
    href: null,
  };
}
