import type { MessagesSection } from "@/lib/content/schema";

/**
 * The WhatsApp messages the team sends from a booking, as they start. They
 * state only what the booking and the content say; check-in times come from
 * the house rules, which are still to be confirmed, so the owner should
 * check those before relying on the check-in message.
 */
export const messagesDefaults: MessagesSection = {
  confirmation:
    "Hi {guestName}, thank you for booking with {businessName}. Your booking {ref} is confirmed: the {room}, arriving {arrive} and leaving {leave} ({nights}). We'll send directions closer to the time.",
  directions:
    "Hi {guestName}, we're at {location}. There's enclosed parking inside the property. WhatsApp or call us on {phone} when you're on your way, and we'll be ready for you.",
  checkIn:
    "Hi {guestName}, looking forward to welcoming you on {arrive}. Check-in is from {checkInFrom} to {checkInUntil}, and check-out is by {checkOutUntil} on {leave}. Let us know roughly when you'll arrive.",
};
