import { formatPhoneNumber } from "@/lib/format/phone";
import { sitePageNames, sitePages } from "@/lib/content/pages";
import { socialPlatformNames, type SectionData, type SectionKey } from "@/lib/content/schema";

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
