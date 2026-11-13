"use server";

import { redirect } from "next/navigation";
import { rateLimitedMessage } from "@/lib/booking/spam-rules";
import { failedState, invalidState, type FormState } from "@/lib/forms/form-state";
import { signReceipt } from "@/server/booking-receipts";
import { reportError } from "@/server/infrastructure";
import { bookingService } from "@/server/stays";
import { currentVisitorKey } from "@/server/visitor";

const unavailableMessages = {
  full: "Sorry, that room has just been booked for some of these nights.",
  "too-small": "That room doesn't sleep this many guests.",
  "unknown-apartment": "That room isn't offered online any more.",
} as const;

const unexpectedMessage = "Your request didn't go through. Try again in a moment, or WhatsApp or call us to book.";

/**
 * Sends the Book page's request form. The service checks everything again
 * (bots, the form's age, every field, the dates, the visitor's limits and
 * the room's availability) before it stores anything. A sent request
 * goes to the confirmation page with a signed receipt in its address.
 */
export async function sendBookingRequest(_previous: FormState, formData: FormData): Promise<FormState> {
  let receipt: string;
  try {
    const visitor = { key: await currentVisitorKey() };
    const result = await bookingService().form.submit(Object.fromEntries(formData), visitor);
    switch (result.status) {
      case "invalid":
        return invalidState(result.errors);
      case "unavailable":
        return failedState(unavailableMessages[result.reason]);
      case "rate-limited":
        return failedState(rateLimitedMessage);
      case "sent":
        receipt = signReceipt({ ref: result.ref, apartment: result.apartment, arrive: result.stay.arrive, leave: result.stay.leave, guests: result.guests });
    }
  } catch (error) {
    reportError("A booking request couldn't be sent", error);
    return failedState(unexpectedMessage);
  }
  redirect(`/book/confirmed?r=${encodeURIComponent(receipt)}`);
}
