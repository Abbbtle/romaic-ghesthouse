import type { BookSection } from "@/lib/content/schema";

/**
 * The Book page's words. A request, then the owner confirms: the default
 * booking mode until the client decides (open question #10). The consent
 * wording is versioned: each request records the version it was sent under,
 * with the privacy notice's.
 */
export const bookDefaults: BookSection = {
  heading: "Book your stay",
  intro: "Choose your dates and how many of you are coming, and we'll show you the apartments that fit.",
  requestNote: "This is a booking request, not a confirmed booking. We'll check it and reply on WhatsApp or by email to confirm your stay.",
  consent: {
    label: "I agree that Romaic Guesthouse may use the details I've given to reply to this request and arrange my stay, as the privacy notice explains.",
    version: "0.1",
    updatedOn: "2026-11-12",
  },
  confirmation: {
    heading: "Request sent",
    text: "Thank you. We'll check your dates and reply on WhatsApp or by email to confirm. If your plans change, WhatsApp or call us.",
  },
};
