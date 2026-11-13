import type { SiteContent } from "../schema";

/**
 * A complete, valid set of content for tests: invented sample values, not
 * the site's real defaults (src/content), so tests don't change when the
 * copy does. A fresh copy each call, so a test can change it freely.
 */
export function sampleContent(): SiteContent {
  return {
    site: {
      businessName: "Sample Guesthouse",
      description: "Sample apartments for testing the content engine.",
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
    seo: {
      pages: {
        home: { title: "Sample Guesthouse – Sampleton", description: "Sample apartments in Sampleton." },
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
