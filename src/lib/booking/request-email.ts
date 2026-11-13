import { formatDayShort } from "@/lib/format/date-time";
import { formatPhoneNumber } from "@/lib/format/phone";
import type { EmailMessage } from "@/lib/kernel/email";
import { stayLabel } from "@/lib/inventory/stays";
import { guestsOf, type BookingRequest } from "./requests";

/**
 * The email that tells the owner a request has arrived. It goes only to the
 * guesthouse's own address, never to an address a guest typed, so the form
 * can't be used to send email to anyone else. It's kept brief (POPIA:
 * mailboxes and the mail provider's logs keep copies): the guest's email
 * address and notes stay in the dashboard.
 */

export type NewRequestEmailOptions = {
  /** The guesthouse's own address. */
  to: string;
  /** The dashboard's requests page, as a full address. */
  requestsPageUrl: string;
};

/** Guest text on one line, so it can't break the layout of a subject or a list. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function newRequestEmail(request: BookingRequest, options: NewRequestEmailOptions): EmailMessage {
  const guests = guestsOf(request);
  const lines = [
    `New booking request ${request.ref}`,
    "",
    `Room: ${oneLine(request.apartmentName)}`,
    `Stay: ${stayLabel(request.stay)}`,
    `Guests: ${guests} (${request.adults} ${request.adults === 1 ? "adult" : "adults"}${request.children > 0 ? `, ${request.children} ${request.children === 1 ? "child" : "children"}` : ""})`,
    `Name: ${oneLine(request.name)}`,
    `Phone: ${formatPhoneNumber(request.phone)}`,
    ...(request.notes || request.email || request.arrivalTime ? ["", "They left more details: read them in the dashboard."] : []),
    "",
    `Accept or decline it: ${options.requestsPageUrl}`,
    "Until you accept it, the room stays open to others.",
  ];
  return {
    to: options.to,
    subject: `New request ${request.ref}: ${oneLine(request.apartmentName)}, arriving ${formatDayShort(request.stay.arrive)}`,
    text: lines.join("\n"),
  };
}
