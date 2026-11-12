import type { SeoSection } from "@/lib/content/schema";

/**
 * Search titles and descriptions for the pages that exist in Phase 1. Every
 * fact in them is the client's own (brand guide and posters): spacious
 * apartments, 286 Stateway, Bedelia, Welkom, walking distance of the CBD,
 * fast Wi-Fi, secure parking. Phase 2 adds a line for each new page.
 */
export const seoDefaults: SeoSection = {
  pages: {
    home: {
      title: "Romaic Guesthouse – Spacious apartments in Welkom",
      description:
        "Spacious apartments at 286 Stateway, Bedelia, Welkom, within walking distance of the CBD, with fast Wi-Fi and secure, enclosed parking.",
    },
    privacy: {
      title: "Privacy notice – Romaic Guesthouse",
      description: "How Romaic Guesthouse collects, uses and protects your personal information.",
    },
  },
};
