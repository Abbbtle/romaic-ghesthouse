import { addressLine } from "@/lib/content/derive";
import { fillPlaceholders } from "@/lib/content/placeholders";
import type { MessagePlaceholder, SiteContent } from "@/lib/content/schema";
import { formatDayShort } from "@/lib/format/date-time";
import { formatPhoneNumber, whatsappLink } from "@/lib/format/phone";
import { nightsLabel } from "@/lib/inventory/stays";
import type { BookingWithGuest } from "@/lib/reservations/reservations";

export type GuestMessage = { key: "confirmation" | "directions" | "checkIn"; label: string; text: string; href: string | null };

const labels: Record<GuestMessage["key"], string> = {
  confirmation: "Confirmation",
  directions: "Directions",
  checkIn: "Check-in details",
};

/**
 * A booking's WhatsApp messages from the owner's templates, with the
 * booking's and the business's details filled in, each with a wa.me link to
 * the guest's number (none when the guest has no phone). Nothing is sent:
 * the link opens WhatsApp for the person to check and send.
 */
export function guestMessages(
  booking: BookingWithGuest,
  content: Pick<SiteContent, "messages" | "site" | "contact" | "policies">,
  apartmentName: string,
): GuestMessage[] {
  const values: Record<MessagePlaceholder, string> = {
    guestName: booking.guest.name.split(" ")[0] ?? booking.guest.name,
    ref: booking.ref,
    room: apartmentName,
    // Messages saved before {room} was renamed from {apartment}.
    apartment: apartmentName,
    arrive: formatDayShort(booking.stay.arrive),
    leave: formatDayShort(booking.stay.leave),
    nights: nightsLabel(booking.stay),
    businessName: content.site.businessName,
    location: addressLine(content.site.address),
    phone: formatPhoneNumber(content.contact.phone),
    checkInFrom: content.policies.checkIn.from,
    checkInUntil: content.policies.checkIn.until,
    checkOutUntil: content.policies.checkOut.until,
  };
  return (Object.keys(labels) as GuestMessage["key"][]).map((key) => {
    const text = fillPlaceholders(content.messages[key], values);
    return { key, label: labels[key], text, href: booking.guest.phone ? whatsappLink(booking.guest.phone, text) : null };
  });
}
