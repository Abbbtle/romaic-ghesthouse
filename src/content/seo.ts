import type { SeoSection } from "@/lib/content/schema";

/**
 * Search titles and descriptions for each page. Every fact in them is the
 * client's own (brand guide and posters): spacious apartments, 286 Stateway,
 * Bedelia, Welkom, walking distance of the CBD, fast Wi-Fi, secure parking.
 * No ratings, stars or prices.
 */
export const seoDefaults: SeoSection = {
  pages: {
    home: {
      title: "Romaic Guesthouse – Spacious apartments in Welkom",
      description:
        "Spacious apartments at 286 Stateway, Bedelia, Welkom, within walking distance of the CBD, with fast Wi-Fi and secure, enclosed parking.",
    },
    apartments: {
      title: "Apartments – Romaic Guesthouse, Welkom",
      description: "Self-catering apartments in Bedelia, Welkom, each with a fridge, microwave and fast Wi-Fi. See who each one sleeps and check your dates.",
    },
    gallery: {
      title: "Gallery – Romaic Guesthouse, Welkom",
      description: "A look around Romaic Guesthouse and its apartments in Bedelia, Welkom.",
    },
    facilities: {
      title: "Facilities – Romaic Guesthouse, Welkom",
      description: "Backup gas geysers, two JoJo water tanks, fast Wi-Fi, an electric fence, security cameras and enclosed parking at Romaic Guesthouse, Welkom.",
    },
    location: {
      title: "Location – Romaic Guesthouse, Bedelia, Welkom",
      description: "Romaic Guesthouse is at 286 Stateway, Bedelia, Welkom, within walking distance of the CBD, with enclosed parking.",
    },
    policies: {
      title: "House rules – Romaic Guesthouse, Welkom",
      description: "Check-in and check-out times and the house rules at Romaic Guesthouse, Welkom.",
    },
    contact: {
      title: "Contact – Romaic Guesthouse, Welkom",
      description: "WhatsApp or call +27 76 957 9928, or email guesthouseromaic@gmail.com, to book at Romaic Guesthouse, Welkom.",
    },
    book: {
      title: "Book – Romaic Guesthouse, Welkom",
      description: "Choose your dates and guests, see which apartments fit, and send a booking request to Romaic Guesthouse, Welkom.",
    },
    privacy: {
      title: "Privacy notice – Romaic Guesthouse",
      description: "How Romaic Guesthouse collects, uses and protects your personal information.",
    },
  },
};
