import { z } from "zod";
import { fieldErrorsOf, type Parsed } from "@/lib/forms/parse";
import {
  emailField,
  httpsUrlField,
  httpsUrlProblem,
  isoDateField,
  listField,
  markdownField,
  phoneField,
  textField,
  tooLongMessage,
  versionField,
} from "./fields";
import { listLimits, textLimits } from "./limits";
import {
  apartmentsSchema,
  bookingTermsSchema,
  bookSchema,
  contactPageSchema,
  facilitiesSchema,
  gallerySchema,
  homeSchema,
  locationSchema,
  messagesSchema,
  policiesSchema,
} from "./page-sections";
import { sitePages, type SitePage } from "./pages";

export { contentIconNames, contentIcons, imageRefSchema, standInSource, type ContentIcon, type ImageRef } from "./shapes";
export type { Apartment, Facility, FacilityGroup, GalleryPhoto, Highlight, HouseRule, MessagePlaceholder, NearbyPlace, TimeWindow } from "./page-sections";
export { messagePlaceholders } from "./page-sections";

/**
 * Everything on the public site the dashboard can change, as one schema per
 * section. Layout is fixed in code; content fills fixed structures. Each
 * section is saved as a whole, so its schema checks the whole thing, with
 * problems keyed by dotted path ("address.city") through parseSection.
 *
 * Facts are stored once: the business's name and address live in `site`,
 * its phone, WhatsApp and email in `contact`. The contact details are a
 * section of their own because only the owner may change them (roles.md,
 * R2): they're where guests send money questions, so a changed number is a
 * payment-redirection risk.
 *
 * Changing a schema later: content saved by an earlier release must still
 * read. The service lays stored sections over the defaults object by object,
 * so a new field in an object takes its default; a new field inside list
 * items needs its own `.default(…)`, or every stored list would fail to
 * validate and fall back to the seed.
 */

// --- vocabulary ----------------------------------------------------------------------

export const socialPlatforms = ["facebook", "instagram", "tiktok", "youtube", "linkedin", "x"] as const;

export type SocialPlatform = (typeof socialPlatforms)[number];

export const socialPlatformNames: Record<SocialPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  x: "X",
};

const socialPlatformHosts: Record<SocialPlatform, readonly string[]> = {
  facebook: ["facebook.com", "fb.com"],
  instagram: ["instagram.com"],
  tiktok: ["tiktok.com"],
  youtube: ["youtube.com", "youtu.be"],
  linkedin: ["linkedin.com"],
  x: ["x.com", "twitter.com"],
};

const socialPlatformExamples: Record<SocialPlatform, string> = {
  facebook: "https://www.facebook.com/yourpage",
  instagram: "https://www.instagram.com/yourname",
  tiktok: "https://www.tiktok.com/@yourname",
  youtube: "https://www.youtube.com/@yourname",
  linkedin: "https://www.linkedin.com/company/yourname",
  x: "https://x.com/yourname",
};

/** The facts a {placeholder} in site text can fill in: the business name and address from `site`, the email and phone from `contact`. */
export const sitePlaceholders = ["businessName", "location", "email", "phone"] as const;

export type SitePlaceholder = (typeof sitePlaceholders)[number];

// --- site: business details ------------------------------------------------------------

/** Where the guesthouse is. Pages show it in full or as suburb and town; search engines get the parts. */
export const siteAddressSchema = z.object({
  street: textField({ noun: "the street address", max: textLimits.addressPart, required: "Enter the street address, like 286 Stateway." }),
  area: textField({ noun: "the suburb", max: textLimits.addressPart, required: "Enter the suburb, like Bedelia." }),
  city: textField({ noun: "the town or city", max: textLimits.addressPart, required: "Enter the town or city, like Welkom." }),
  province: textField({ noun: "the province", max: textLimits.addressPart }),
  postalCode: textField({ noun: "the postal code", max: textLimits.postalCode }),
  /** Advanced: a Google Maps link to use instead of searching for the address. */
  mapUrl: httpsUrlField({ noun: "the map link", example: "https://maps.app.goo.gl/…", hosts: ["google.com", "google.co.za", "goo.gl"] }).nullable(),
});

export type SiteAddress = z.output<typeof siteAddressSchema>;

export const socialLinkSchema = z
  .object({
    platform: z.enum(socialPlatforms, { error: "Choose the platform." }),
    url: z
      .string({ error: "Enter the link." })
      .overwrite((value) => value.trim())
      .max(textLimits.url, tooLongMessage("the link", textLimits.url)),
  })
  .superRefine((link, context) => {
    if (!Object.hasOwn(socialPlatformHosts, link.platform)) return;
    const problem = httpsUrlProblem(link.url, {
      noun: `your ${socialPlatformNames[link.platform]} link`,
      example: socialPlatformExamples[link.platform],
      hosts: socialPlatformHosts[link.platform],
    });
    if (problem) context.addIssue({ code: "custom", path: ["url"], message: problem });
  });

export type SocialLink = z.output<typeof socialLinkSchema>;

export const siteSchema = z.object({
  businessName: textField({ noun: "the business name", max: textLimits.businessName, required: "Enter the business name." }),
  /** The footer blurb, and the description search engines fall back on. */
  description: textField({ noun: "the description", max: textLimits.siteDescription, required: "Enter a short description." }),
  address: siteAddressSchema,
  socialLinks: listField(socialLinkSchema, listLimits.socialLinks, { one: "social link", many: "social links" }),
  /** Advanced: the agency credit in the footer, or null for none. */
  footerCredit: z
    .object({
      label: textField({ noun: "the credit", max: textLimits.footerCredit, required: "Enter the credit, or remove it." }),
      url: httpsUrlField({ noun: "the credit link", example: "https://weberu.io" }).nullable(),
    })
    .nullable(),
});

// --- contact: how guests reach the owner (owner only) --------------------------------

export const contactSchema = z.object({
  /** For calls, and for WhatsApp unless a separate WhatsApp number is set. Stored in E.164. */
  phone: phoneField("a phone number"),
  whatsapp: phoneField("a WhatsApp number").nullable(),
  email: emailField,
  /** What WhatsApp opens with from the site's general "WhatsApp us" buttons. */
  whatsappMessage: textField({ noun: "the WhatsApp message", max: textLimits.whatsappMessage, required: "Enter the message WhatsApp opens with." }),
});

// --- seo: search results -------------------------------------------------------------

export const pageSeoSchema = z.object({
  title: textField({ noun: "the title", max: textLimits.seoTitle, required: "Enter the title search engines show for this page." }),
  description: textField({ noun: "the description", max: textLimits.seoDescription, required: "Enter the description search engines show for this page." }),
});

export type PageSeo = z.output<typeof pageSeoSchema>;

const seoPages = Object.fromEntries(sitePages.map((page) => [page, pageSeoSchema])) as Record<SitePage, typeof pageSeoSchema>;

/** Each page's title and description in search results, complete as shown (titles aren't suffixed). */
export const seoSchema = z.object({ pages: z.object(seoPages) });

// --- privacy notice ------------------------------------------------------------------

export const privacySchema = z.object({
  heading: textField({ noun: "the title", max: textLimits.privacyHeading, required: "Enter the page title." }),
  body: markdownField({ noun: "the notice", max: textLimits.privacyBody, required: "Enter the privacy notice.", placeholders: sitePlaceholders }),
  version: versionField,
  updatedOn: isoDateField("the date it was last updated"),
});

// --- the sections --------------------------------------------------------------------

export const sectionKeys = [
  "site",
  "contact",
  "bookingTerms",
  "messages",
  "home",
  "apartments",
  "gallery",
  "facilities",
  "location",
  "policies",
  "contactPage",
  "book",
  "seo",
  "privacy",
] as const;

export type SectionKey = (typeof sectionKeys)[number];

export const sectionSchemas = {
  site: siteSchema,
  contact: contactSchema,
  bookingTerms: bookingTermsSchema,
  messages: messagesSchema,
  home: homeSchema,
  apartments: apartmentsSchema,
  gallery: gallerySchema,
  facilities: facilitiesSchema,
  location: locationSchema,
  policies: policiesSchema,
  contactPage: contactPageSchema,
  book: bookSchema,
  seo: seoSchema,
  privacy: privacySchema,
} as const satisfies Record<SectionKey, z.ZodType>;

/** A section's content, as validated: what pages read and what the store keeps. */
export type SectionData<K extends SectionKey> = z.output<(typeof sectionSchemas)[K]>;

export type SiteContent = { [K in SectionKey]: SectionData<K> };

export type SiteSection = SectionData<"site">;
export type ContactSection = SectionData<"contact">;
export type BookingTermsSection = SectionData<"bookingTerms">;
export type MessagesSection = SectionData<"messages">;
export type HomeSection = SectionData<"home">;
export type ApartmentsSection = SectionData<"apartments">;
export type GallerySection = SectionData<"gallery">;
export type FacilitiesSection = SectionData<"facilities">;
export type LocationSection = SectionData<"location">;
export type PoliciesSection = SectionData<"policies">;
export type ContactPageSection = SectionData<"contactPage">;
export type BookSection = SectionData<"book">;
export type SeoSection = SectionData<"seo">;
export type PrivacySection = SectionData<"privacy">;

export function isSectionKey(value: unknown): value is SectionKey {
  return typeof value === "string" && (sectionKeys as readonly string[]).includes(value);
}

/**
 * Who may edit each section (roles.md): the permission the dashboard and the
 * content service check. The pages, business details, search results and
 * privacy notice are site content, which admins (Weberu) look after too; the
 * contact details guests use, and the booking terms that move money, are
 * the owner's alone. The names are the accounts core's permissions; content
 * can't import that core, so the composition layer (src/server/content.ts)
 * checks they exist.
 */
export const sectionPermissions = {
  site: "content:edit",
  contact: "settings:contact",
  bookingTerms: "settings:booking-rules",
  messages: "settings:booking-rules",
  home: "content:edit",
  apartments: "content:edit",
  gallery: "content:edit",
  facilities: "content:edit",
  location: "content:edit",
  policies: "content:edit",
  contactPage: "content:edit",
  book: "content:edit",
  seo: "content:edit",
  privacy: "content:edit",
} as const satisfies Record<SectionKey, string>;

export type SectionPermission = (typeof sectionPermissions)[SectionKey];

/**
 * What an editor sees when part of a section arrives in the wrong shape (an
 * object or switch missing, say), which only an out-of-date form sends:
 * zod's own wording ("Invalid input: expected boolean") never reaches them.
 */
export const malformedSectionMessage = "Reload the page and try again: part of this form didn't arrive as expected.";

/** parseWith, with malformedSectionMessage for problems the schema has no message of its own for. */
function parseSectionWith<Schema extends z.ZodType>(schema: Schema, input: unknown): Parsed<z.output<Schema>> {
  const result = schema.safeParse(input, { error: () => malformedSectionMessage });
  return result.success ? { ok: true, value: result.data } : { ok: false, errors: fieldErrorsOf(result.error) };
}

const sectionParsers: { [K in SectionKey]: (input: unknown) => Parsed<SectionData<K>> } = {
  site: (input) => parseSectionWith(siteSchema, input),
  contact: (input) => parseSectionWith(contactSchema, input),
  bookingTerms: (input) => parseSectionWith(bookingTermsSchema, input),
  messages: (input) => parseSectionWith(messagesSchema, input),
  home: (input) => parseSectionWith(homeSchema, input),
  apartments: (input) => parseSectionWith(apartmentsSchema, input),
  gallery: (input) => parseSectionWith(gallerySchema, input),
  facilities: (input) => parseSectionWith(facilitiesSchema, input),
  location: (input) => parseSectionWith(locationSchema, input),
  policies: (input) => parseSectionWith(policiesSchema, input),
  contactPage: (input) => parseSectionWith(contactPageSchema, input),
  book: (input) => parseSectionWith(bookSchema, input),
  seo: (input) => parseSectionWith(seoSchema, input),
  privacy: (input) => parseSectionWith(privacySchema, input),
};

/**
 * Untrusted input checked as section `key`'s content: the tidied value, or
 * problems keyed by dotted path ("address.city"). The editor runs it for
 * instant feedback; the service runs it again before saving.
 */
export function parseSection<K extends SectionKey>(key: K, input: unknown): Parsed<SectionData<K>> {
  const parse: (input: unknown) => Parsed<SectionData<K>> = sectionParsers[key];
  return parse(input);
}

/** Labels for the dashboard. */
export const sectionNames: Record<SectionKey, string> = {
  site: "Business details",
  contact: "Contact details",
  bookingTerms: "Booking terms",
  messages: "Guest messages",
  home: "Home page",
  apartments: "Apartments",
  gallery: "Gallery",
  facilities: "Facilities",
  location: "Location and area",
  policies: "House rules",
  contactPage: "Contact page",
  book: "Booking form",
  seo: "Search results",
  privacy: "Privacy notice",
};

/** One sentence per section for the dashboard: what it covers. */
export const sectionDescriptions: Record<SectionKey, string> = {
  site: "Your business name, address, description and social links, used across the whole site.",
  contact: "The phone number, WhatsApp number and email address guests use to reach you and book.",
  bookingTerms: "Your deposit, balance, cancellation and payment terms for direct bookings.",
  messages: "The WhatsApp messages your team sends from a booking: the confirmation, directions and check-in details.",
  home: "The headline, photo and introduction guests see first, and what the home page highlights.",
  apartments: "Each apartment's name, beds, bathroom, features, photos and who it sleeps.",
  gallery: "The photos on the gallery page, with their captions.",
  facilities: "What the guesthouse offers, in groups, on the facilities page.",
  location: "Where you are, how to get there, and the places nearby.",
  policies: "Check-in and check-out times and your house rules.",
  contactPage: "The words on the contact page. Your phone and email come from Contact details.",
  book: "The booking page's words, what guests agree to, and what they see after sending a request.",
  seo: "The title and description search engines show for each page.",
  privacy: "Your privacy notice, which POPIA requires.",
};

/** Extra guidance where a section needs it. */
export const sectionHelp: Partial<Record<SectionKey, string>> = {
  messages:
    "Only the owner can change these. {guestName}, {ref}, {apartment}, {arrive}, {leave} and {nights} fill in the booking's details; {businessName}, {location} and {phone} your business's; {checkInFrom}, {checkInUntil} and {checkOutUntil} the times from your house rules. Nothing is sent by itself: the team opens each message in WhatsApp, checks it and sends it.",
  bookingTerms:
    "Only the owner can change these. Leave a term empty until you've decided it: the site then says it's still to be confirmed rather than guessing. Each change is recorded in the audit log.",
  apartments:
    "Tick \"Details confirmed\" once you've checked an apartment's beds, bathroom, features and how many it sleeps. Until then the site marks them \"To confirm\". The Book page offers an apartment to groups up to the number it sleeps, and only while it's shown on the site.",
  book: "The consent wording is part of what each guest agrees to, so changing it gives it a new version and date by themselves. Each booking request records the version it was sent under.",
  site: "Your address is stored once here and used everywhere it appears. The map link is worked out from it.",
  contact:
    "Only the owner can change these. Guests use them to book and to ask about payments, so check every digit before you save. Each change is recorded in the audit log.",
  privacy:
    "Formatting: start a line with ## for a heading (### or #### for smaller ones), with - for a bulleted list or 1. for a numbered one. Use **bold**, *italic* and [link text](https://…); links can also start with mailto: or tel:, or be a page on this site such as /privacy. {businessName}, {location}, {email} and {phone} fill in your business and contact details. Changing the text gives it a new version and date by themselves.",
};

/** The page each section's "View on site" link opens. */
export const sectionPages: Record<SectionKey, SitePage | null> = {
  site: "home",
  contact: "contact",
  bookingTerms: "policies",
  messages: null,
  home: "home",
  apartments: "apartments",
  gallery: "gallery",
  facilities: "facilities",
  location: "location",
  policies: "policies",
  contactPage: "contact",
  book: "book",
  seo: "home",
  privacy: "privacy",
};
