import { formatRands } from "@/lib/format/money";
import { formatPhoneNumber, whatsappLink } from "@/lib/format/phone";
import { socialPlatformNames, type ContactSection, type SiteAddress, type SitePlaceholder, type SiteSection, type SocialLink } from "./schema";

/**
 * Values worked out from content rather than stored, so they can't disagree
 * with it: the address as one line, map and WhatsApp links, placeholder
 * values, initials. Pure functions; pages call them with the content they
 * already have.
 */

// --- business and contact details --------------------------------------------------

/** The number WhatsApp links use: the separate WhatsApp number when there is one, otherwise the phone. */
export function whatsappNumber(contact: ContactSection): string {
  return contact.whatsapp ?? contact.phone;
}

/** A wa.me link with the general message, for the site's "WhatsApp us" buttons. */
export function generalWhatsappLink(contact: ContactSection): string {
  return whatsappLink(whatsappNumber(contact), contact.whatsappMessage);
}

/** "286 Stateway, Bedelia, Welkom" */
export function addressLine(address: SiteAddress): string {
  return [address.street, address.area, address.city].filter(Boolean).join(", ");
}

/** "Bedelia, Welkom": for tight spots. */
export function areaLine(address: SiteAddress): string {
  return [address.area, address.city].filter(Boolean).join(", ");
}

/** A Google Maps link: the advanced override, or a search for the address. */
export function mapLink(address: SiteAddress): string {
  if (address.mapUrl) return address.mapUrl;
  const query = [address.street, address.area, address.city, address.province].filter(Boolean).join(", ");
  return `https://maps.google.com/?q=${encodeURIComponent(query)}`;
}

/** The values for the {businessName}, {location}, {email} and {phone} placeholders. */
export function siteFacts(site: SiteSection, contact: ContactSection): Record<SitePlaceholder, string> {
  return {
    businessName: site.businessName,
    location: addressLine(site.address),
    email: contact.email,
    phone: formatPhoneNumber(contact.phone),
  };
}

/** What a social icon link is called: "Romaic Guesthouse on Facebook". */
export function socialLinkLabel(site: SiteSection, link: SocialLink): string {
  return `${site.businessName} on ${socialPlatformNames[link.platform]}`;
}

// --- calls to action -------------------------------------------------------------------

/** A button or link as components draw it. Phase 2 adds the content that makes them. */
export type CtaLink = {
  label: string;
  href: string;
  /** Leads to WhatsApp, so it opens in a new tab and says "(opens WhatsApp)". */
  opensWhatsapp: boolean;
};

// --- prices ----------------------------------------------------------------------------

/** What a price is for. Prices are whole rands; a price of null reads as "on request". */
export type PriceUnit = "night" | "once-off";

/** What a price of null shows. */
export const onRequestPriceLabel = "Price on request";

const priceUnitSuffixes: Record<PriceUnit, string> = { night: "/night", "once-off": "" };

const priceUnitSpoken: Record<PriceUnit, string> = { night: " per night", "once-off": "" };

export type PriceDisplay = {
  /** "R1,250", or "Price on request". */
  amount: string;
  /** Shown after the amount: "/night", or "". */
  unit: string;
  /** What screen readers hear instead of `unit`: " per night". */
  unitSpoken: string;
};

/** How a price reads. Every price on the site goes through here. */
export function priceDisplay(price: number | null, unit: PriceUnit): PriceDisplay {
  if (price === null) return { amount: onRequestPriceLabel, unit: "", unitSpoken: "" };
  return { amount: formatRands(price), unit: priceUnitSuffixes[unit], unitSpoken: priceUnitSpoken[unit] };
}

// --- people ----------------------------------------------------------------------------

const letterOrDigit = /[\p{L}\p{N}]/u;

/** "Thandi Mokoena" → "TM", "Sipho" → "S": an avatar's letters. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const firstOf = (word: string | undefined) => Array.from(word ?? "").find((character) => letterOrDigit.test(character)) ?? "";
  const first = firstOf(words[0]);
  const last = words.length > 1 ? firstOf(words.at(-1)) : "";
  return `${first}${last}`.toUpperCase();
}
