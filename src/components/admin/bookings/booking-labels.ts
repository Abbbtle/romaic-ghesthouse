import { bookingStatusNames, directSourceNames, type BookingStatus } from "@/lib/reservations/reservations";
import type { StatusTone } from "../status-pill";

/** How each status reads as a pill: never by colour alone, the words say it. */
export const bookingStatusTones: Record<BookingStatus, StatusTone> = {
  confirmed: "info",
  "checked-in": "success",
  "checked-out": "neutral",
  cancelled: "neutral",
  "no-show": "warning",
};

export { bookingStatusNames };

/** The channels a booking can come from, until the channels list is configurable (src/lib/channels): direct sources first. */
export const bookingSourceOptions: readonly { value: string; label: string }[] = [
  ...Object.entries(directSourceNames).map(([value, label]) => ({ value, label })),
  { value: "booking-com", label: "Booking.com" },
  { value: "airbnb", label: "Airbnb" },
  { value: "expedia", label: "Expedia" },
  { value: "lekkeslaap", label: "LekkeSlaap" },
  { value: "safarinow", label: "SafariNow" },
];

/** A booking source's name, or its key when it isn't one of the known ones. */
export function sourceName(key: string): string {
  return bookingSourceOptions.find((option) => option.value === key)?.label ?? key;
}
