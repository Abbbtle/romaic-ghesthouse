import { formatPhoneNumber } from "@/lib/format/phone";
import { sitePageNames, sitePages } from "@/lib/content/pages";
import { contentIconNames, socialPlatformNames, type SectionData, type SectionKey } from "@/lib/content/schema";

const yesNo = (value: boolean) => (value ? "Yes" : "No");
const lines = (values: readonly string[]) => values.join("\n");

/** One field of an earlier version, as the history page lists it. */
export type RevisionField = {
  label: string;
  /** "" shows as "Not filled in". */
  value: string;
  /** Long text (the privacy notice), shown with its line breaks. */
  multiline?: boolean;
};

/**
 * An earlier version of a section as a read-only list of its fields, with
 * the labels its editor uses, so someone can see what restoring it would
 * put back before they do.
 */
export function revisionFields<K extends SectionKey>(key: K, data: SectionData<K>): RevisionField[] {
  const read: (data: SectionData<K>) => RevisionField[] = fieldReaders[key];
  return read(data);
}

const fieldReaders: { [K in SectionKey]: (data: SectionData<K>) => RevisionField[] } = {
  site: (site) => [
    { label: "Business name", value: site.businessName },
    { label: "Short description", value: site.description },
    { label: "Street address", value: site.address.street },
    { label: "Suburb", value: site.address.area },
    { label: "Town or city", value: site.address.city },
    { label: "Province", value: site.address.province },
    { label: "Postal code", value: site.address.postalCode },
    { label: "Google Maps link", value: site.address.mapUrl ?? "" },
    {
      label: "Social links",
      value: site.socialLinks.map((link) => `${socialPlatformNames[link.platform]}: ${link.url}`).join("\n"),
      multiline: true,
    },
    { label: "Footer credit", value: site.footerCredit ? [site.footerCredit.label, site.footerCredit.url].filter(Boolean).join(" · ") : "" },
  ],
  contact: (contact) => [
    { label: "Phone number", value: formatPhoneNumber(contact.phone) },
    { label: "WhatsApp number", value: contact.whatsapp ? formatPhoneNumber(contact.whatsapp) : "Same as the phone number" },
    { label: "Email address", value: contact.email },
    { label: "WhatsApp opening message", value: contact.whatsappMessage, multiline: true },
  ],
  bookingTerms: (terms) => [
    { label: "Deposit", value: terms.deposit, multiline: true },
    { label: "Balance", value: terms.balance, multiline: true },
    { label: "Cancellation", value: terms.cancellation, multiline: true },
    { label: "Payment", value: terms.payment, multiline: true },
  ],
  home: (home) => [
    { label: "Headline", value: home.hero.headline },
    { label: "Introduction", value: home.hero.lead, multiline: true },
    { label: "Welcome line", value: home.hero.welcome },
    { label: "Main photo", value: `${home.hero.photo.alt} (${home.hero.photo.src})` },
    { label: "Apartments heading", value: home.apartments.heading },
    { label: "Apartments introduction", value: home.apartments.intro, multiline: true },
    { label: "Highlights heading", value: home.highlights.heading },
    { label: "Highlights introduction", value: home.highlights.intro, multiline: true },
    {
      label: "Highlights",
      value: home.highlights.items.map((item) => `${item.title} (${contentIconNames[item.icon]}): ${item.lines.join("; ")}`).join("\n"),
      multiline: true,
    },
    { label: "Location heading", value: home.location.heading },
    { label: "Location text", value: home.location.text, multiline: true },
  ],
  apartments: (apartments) => [
    { label: "Heading", value: apartments.heading },
    { label: "Introduction", value: apartments.intro, multiline: true },
    ...apartments.items.flatMap((item, index) => [
      {
        label: `Apartment ${index + 1}`,
        value: [
          `${item.name} (/apartments/${item.slug})`,
          `Sleeps ${item.sleeps} · ${item.beds}`,
          item.bathroom,
          item.view && `View: ${item.view}`,
          item.summary,
          item.description,
          item.features.length > 0 && `Features: ${item.features.join(", ")}`,
          item.accessibility && `Accessibility: ${item.accessibility}`,
          `${item.photos.length} ${item.photos.length === 1 ? "photo" : "photos"}`,
          `Details confirmed: ${yesNo(item.confirmed)} · Shown on the site: ${yesNo(item.published)}`,
        ]
          .filter(Boolean)
          .join("\n"),
        multiline: true,
      },
    ]),
  ],
  gallery: (gallery) => [
    { label: "Heading", value: gallery.heading },
    { label: "Introduction", value: gallery.intro, multiline: true },
    { label: "Photos", value: lines(gallery.photos.map(({ photo, caption }) => [photo.alt, caption].filter(Boolean).join(" – "))), multiline: true },
  ],
  facilities: (facilities) => [
    { label: "Heading", value: facilities.heading },
    { label: "Introduction", value: facilities.intro, multiline: true },
    ...facilities.groups.map((group) => ({
      label: group.title,
      value: lines(group.items.map((item) => [item.label, item.note, item.confirmed ? "" : "(to confirm)"].filter(Boolean).join(" – "))),
      multiline: true,
    })),
  ],
  location: (location) => [
    { label: "Heading", value: location.heading },
    { label: "Introduction", value: location.intro, multiline: true },
    { label: "Directions", value: location.directions, multiline: true },
    { label: "Nearby heading", value: location.nearby.heading },
    {
      label: "Nearby places",
      value: lines(location.nearby.places.map((place) => [place.name, place.kind, place.distance, place.confirmed ? "" : "(to confirm)"].filter(Boolean).join(" – "))),
      multiline: true,
    },
    { label: "Note under the list", value: location.nearby.note, multiline: true },
  ],
  policies: (policies) => [
    { label: "Heading", value: policies.heading },
    { label: "Introduction", value: policies.intro, multiline: true },
    { label: "Check-in", value: `${policies.checkIn.from} to ${policies.checkIn.until}${policies.checkIn.confirmed ? "" : " (to confirm)"}` },
    { label: "Check-out", value: `${policies.checkOut.from} to ${policies.checkOut.until}${policies.checkOut.confirmed ? "" : " (to confirm)"}` },
    ...policies.rules.map((rule) => ({ label: rule.title, value: `${rule.text}${rule.confirmed ? "" : " (to confirm)"}`, multiline: true })),
  ],
  contactPage: (page) => [
    { label: "Heading", value: page.heading },
    { label: "Introduction", value: page.intro, multiline: true },
    { label: "Reply note", value: page.responseNote },
  ],
  book: (book) => [
    { label: "Heading", value: book.heading },
    { label: "Introduction", value: book.intro, multiline: true },
    { label: "Note above the form", value: book.requestNote, multiline: true },
    { label: "Consent wording", value: book.consent.label, multiline: true },
    { label: "Consent version", value: `${book.consent.version} (${book.consent.updatedOn})` },
    { label: "After sending: heading", value: book.confirmation.heading },
    { label: "After sending: text", value: book.confirmation.text, multiline: true },
  ],
  seo: (seo) =>
    sitePages.flatMap((page) => [
      { label: `${sitePageNames[page]}: title`, value: seo.pages[page].title },
      { label: `${sitePageNames[page]}: description`, value: seo.pages[page].description },
    ]),
  privacy: (privacy) => [
    { label: "Page title", value: privacy.heading },
    { label: "Version", value: privacy.version },
    { label: "Last updated", value: privacy.updatedOn },
    { label: "The notice", value: privacy.body, multiline: true },
  ],
};
