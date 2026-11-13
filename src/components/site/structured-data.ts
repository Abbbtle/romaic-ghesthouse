import { apartmentPath } from "@/lib/content/pages";
import type { SiteContent } from "@/lib/content/schema";

/**
 * Schema.org data for search engines, built from confirmed facts only
 * (brief rule 2): the business's name, address and contact details, the
 * facilities the owner has confirmed, check-in and check-out times once
 * confirmed, and a room type only once its details are confirmed. Never a
 * star rating, a review score, a price or a stand-in photo: none of those
 * are Romaic's to claim yet.
 */
export function lodgingBusinessData(content: Pick<SiteContent, "site" | "contact" | "facilities" | "policies" | "apartments">, siteUrl: string) {
  const { site, contact, facilities, policies, apartments } = content;
  const { address } = site;
  const amenities = facilities.groups.flatMap((group) => group.items).filter((item) => item.confirmed);
  const rooms = apartments.items.filter((item) => item.published && item.confirmed);
  return {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    name: site.businessName,
    description: site.description,
    url: new URL("/", siteUrl).toString(),
    telephone: contact.phone,
    email: contact.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: address.street,
      addressLocality: [address.area, address.city].filter(Boolean).join(", "),
      ...(address.province ? { addressRegion: address.province } : {}),
      ...(address.postalCode ? { postalCode: address.postalCode } : {}),
      addressCountry: "ZA",
    },
    ...(amenities.length > 0
      ? { amenityFeature: amenities.map((item) => ({ "@type": "LocationFeatureSpecification", name: item.label, value: true })) }
      : {}),
    ...(policies.checkIn.confirmed ? { checkinTime: policies.checkIn.from } : {}),
    ...(policies.checkOut.confirmed ? { checkoutTime: policies.checkOut.until } : {}),
    ...(site.socialLinks.length > 0 ? { sameAs: site.socialLinks.map((link) => link.url) } : {}),
    ...(rooms.length > 0
      ? {
          containsPlace: rooms.map((room) => ({
            "@type": "HotelRoom",
            name: room.name,
            url: new URL(apartmentPath(room.slug), siteUrl).toString(),
            occupancy: { "@type": "QuantitativeValue", maxValue: room.sleeps },
          })),
        }
      : {}),
  };
}

/** JSON for a <script type="application/ld+json">, with "<" escaped so text can never close the tag. */
export function jsonLdText(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
