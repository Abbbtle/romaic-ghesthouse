import { addressLine, areaLine, generalWhatsappLink, mapLink, whatsappNumber } from "@/lib/content/derive";
import type { SiteContent } from "@/lib/content/schema";
import { formatPhoneNumber, telHref, whatsappLink } from "@/lib/format/phone";

/**
 * The business facts every public page's frame shows (header menu, contact
 * bar, footer, phone dock), worked out from the site's content so they
 * can't disagree with it: the owner changes the phone number once, in
 * Contact details, and every page follows.
 */
export type SiteFacts = {
  name: string;
  addressLine: string;
  areaLine: string;
  phone: { e164: string; display: string; tel: string };
  /** wa.me with the general opening message. */
  whatsapp: string;
  /** wa.me to the WhatsApp number with no message, for links that add their own. */
  whatsappNumber: string;
  email: string;
  mapLink: string;
};

export function siteFactsOf(content: Pick<SiteContent, "site" | "contact">): SiteFacts {
  const { site, contact } = content;
  return {
    name: site.businessName,
    addressLine: addressLine(site.address),
    areaLine: areaLine(site.address),
    phone: { e164: contact.phone, display: formatPhoneNumber(contact.phone), tel: telHref(contact.phone) },
    whatsapp: generalWhatsappLink(contact),
    whatsappNumber: whatsappNumber(contact),
    email: contact.email,
    mapLink: mapLink(site.address),
  };
}

/** A WhatsApp link that opens with `message`, such as one naming a booking request. */
export function whatsappWith(facts: SiteFacts, message: string): string {
  return whatsappLink(facts.whatsappNumber, message);
}
