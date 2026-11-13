import type { ContactSection } from "@/lib/content/schema";

/**
 * How guests reach Romaic, from the client's brand guide and posters
 * ("WhatsApp or call 076 957 9928", "guesthouseromaic@gmail.com";
 * docs/planning/brand-guide-notes.md). One number takes both calls and
 * WhatsApp, so there's no separate WhatsApp number. Only the owner can
 * change these (roles.md, R2).
 */
export const contactDefaults: ContactSection = {
  phone: "+27769579928",
  whatsapp: null,
  email: "guesthouseromaic@gmail.com",
  whatsappMessage: "Hi Romaic Guesthouse, I'd like to ask about staying with you.",
};
