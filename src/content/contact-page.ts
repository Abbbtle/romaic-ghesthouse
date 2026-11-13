import type { ContactPageSection } from "@/lib/content/schema";

/**
 * The contact page's words. The phone, WhatsApp and email come from the
 * owner-only Contact details section. How soon guests can expect a reply
 * isn't known, so the note stays empty.
 */
export const contactPageDefaults: ContactPageSection = {
  heading: "Contact us",
  intro: "WhatsApp or call us to book or to ask a question, or send us an email.",
  responseNote: "",
};
