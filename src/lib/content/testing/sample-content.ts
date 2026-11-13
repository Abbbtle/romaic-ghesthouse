import type { ImageRef, SiteContent } from "../schema";

const samplePhoto: ImageRef = { src: "/images/sample.jpg", alt: "A sample photo", width: 1600, height: 1067, focus: { x: 50, y: 50 } };

function seoFor(name: string) {
  return { title: `${name} – Sample Guesthouse`, description: `The ${name.toLowerCase()} page of Sample Guesthouse.` };
}

/**
 * A complete, valid set of content for tests: invented sample values, not
 * the site's real defaults (src/content), so tests don't change when the
 * copy does. A fresh copy each call, so a test can change it freely.
 */
export function sampleContent(): SiteContent {
  return {
    site: {
      businessName: "Sample Guesthouse",
      description: "Sample rooms for testing the content engine.",
      address: {
        street: "1 Test Street",
        area: "Testville",
        city: "Sampleton",
        province: "Free State",
        postalCode: "",
        mapUrl: null,
      },
      socialLinks: [{ platform: "facebook", url: "https://www.facebook.com/sample" }],
      footerCredit: { label: "Site by Sample Studio", url: "https://example.com" },
    },
    contact: {
      phone: "+27821234567",
      whatsapp: null,
      email: "hello@example.com",
      whatsappMessage: "Hi, I'd like to ask about a stay.",
    },
    bookingTerms: { deposit: "", balance: "", cancellation: "Free cancellation up to 7 days before arrival.", payment: "" },
    messages: { confirmation: "Hi {guestName}, booking {ref} is confirmed.", directions: "We're at {location}.", checkIn: "Check-in from {checkInFrom}." },
    home: {
      hero: { headline: "Sample rooms", lead: "A sample lead about the guesthouse.", welcome: "Hello", photo: { ...samplePhoto } },
      apartments: { heading: "Rooms", intro: "Sample rooms." },
      highlights: { heading: "Highlights", intro: "", items: [{ icon: "wifi", title: "Wi-Fi", lines: ["Fast Wi-Fi"] }], photo: { ...samplePhoto } },
      evenings: { heading: "Evenings", intro: "A sample evening.", photos: [{ ...samplePhoto }] },
      location: { heading: "Where we are", text: "In Testville." },
    },
    apartments: {
      heading: "Rooms",
      intro: "",
      items: [
        {
          slug: "sample-double",
          name: "Sample double",
          summary: "A sample room.",
          description: "",
          sleeps: 2,
          beds: "1 double",
          bathroom: "Private, with a shower",
          view: "",
          features: ["Kitchenette"],
          accessibility: "",
          photos: [{ ...samplePhoto }],
          confirmed: true,
          published: true,
        },
        {
          slug: "sample-family",
          name: "Sample family",
          summary: "A larger sample room.",
          description: "",
          sleeps: 4,
          beds: "4 single",
          bathroom: "Private bathroom",
          view: "",
          features: [],
          accessibility: "",
          photos: [],
          confirmed: false,
          published: true,
        },
      ],
    },
    gallery: { heading: "Gallery", intro: "", photos: [{ photo: { ...samplePhoto }, caption: "" }] },
    facilities: {
      heading: "Facilities",
      intro: "",
      groups: [{ title: "Comfort", items: [{ icon: "wifi", label: "Wi-Fi", note: "", confirmed: true }] }],
    },
    location: {
      heading: "Location",
      intro: "",
      directions: "",
      nearby: { heading: "Nearby", note: "", places: [{ name: "Sample Café", kind: "Restaurant", distance: "About 200 m", confirmed: false }] },
    },
    policies: {
      heading: "House rules",
      intro: "",
      checkIn: { from: "14:00", until: "20:00", confirmed: true },
      checkOut: { from: "06:00", until: "10:00", confirmed: true },
      rules: [{ title: "Pets", text: "No pets.", confirmed: true }],
    },
    contactPage: { heading: "Contact", intro: "Get in touch.", responseNote: "" },
    book: {
      heading: "Book",
      intro: "",
      requestNote: "A request, not a booking.",
      consent: { label: "I agree to the sample terms.", version: "1.0", updatedOn: "2026-11-01" },
      confirmation: { heading: "Sent", text: "We'll reply." },
    },
    seo: {
      pages: {
        home: { title: "Sample Guesthouse – Sampleton", description: "Sample rooms in Sampleton." },
        apartments: seoFor("Rooms"),
        gallery: seoFor("Gallery"),
        facilities: seoFor("Facilities"),
        location: seoFor("Location"),
        policies: seoFor("Policies"),
        contact: seoFor("Contact"),
        book: seoFor("Book"),
        privacy: { title: "Privacy notice – Sample Guesthouse", description: "How Sample Guesthouse uses your details." },
      },
    },
    privacy: {
      heading: "Privacy notice",
      body: "## Who we are\n\n{businessName}, {location}. Email {email} or call {phone}.",
      version: "0.1",
      updatedOn: "2026-11-01",
    },
  };
}
