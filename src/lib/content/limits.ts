/**
 * How much each piece of site content may hold. The schemas in ./schema
 * enforce these numbers, and editors use the same ones for `maxLength` and
 * their counters, so the form and the server always agree. Text at its
 * limit still fits the fixed layouts.
 *
 * The sections the whole site shares (business details, contact details,
 * search results, the privacy notice) come first, then the pages' own.
 */
export const textLimits = {
  // Business details
  businessName: 40,
  siteDescription: 200,
  /** Street, suburb, town or city, and province, each. */
  addressPart: 60,
  postalCode: 10,
  url: 300,
  footerCredit: 40,

  // Contact details
  email: 254,
  whatsappMessage: 300,

  // Search results
  seoTitle: 60,
  seoDescription: 160,

  // Pieces pages and editors share
  heading: 40,
  imageAlt: 125,

  // Privacy notice
  privacyHeading: 60,
  privacyBody: 20_000,
  version: 20,

  /** Link names and record ids, such as "family-shower". */
  slug: 48,

  // Page text
  /** The home page's headline, set large over the first photo. */
  heroHeadline: 48,
  /** A short introduction under a page's heading. */
  intro: 400,
  /** The home page's lead paragraph. */
  lead: 320,
  /** The heading of the home page's closing invitation to book ("Welcome home"). */
  closingHeading: 24,
  /** A longer passage: a room's description, directions. */
  passage: 1_500,
  /** One line of a list: an amenity, a feature, a highlight's line. */
  listLine: 120,
  /** A short label: a facility, a nearby place's kind, a highlight's title. */
  label: 60,
  /** A rule or a term, such as the cancellation terms. */
  rule: 600,
  /** A photo's caption in the gallery. */
  caption: 120,
  /** The consent checkbox's wording on the booking form. */
  consent: 400,
} as const;

export type TextLimitName = keyof typeof textLimits;

/**
 * Soft budgets from the design: longer text still saves, but the editor
 * warns that long lines may wrap on phones. The home headline is set large,
 * about 11 characters a line: 36 characters is three lines on a phone, at
 * 320 or 390 px wide.
 */
export const designBudgets = {
  heroHeadline: 36,
  heading: 32,
} as const satisfies Partial<Record<TextLimitName, number>>;

/** The fewest and most items each list may hold. */
export const listLimits = {
  socialLinks: { min: 0, max: 6 },
  highlights: { min: 1, max: 6 },
  highlightLines: { min: 1, max: 4 },
  /** The home page's evening band: a large photo and a smaller one beside it. */
  eveningPhotos: { min: 0, max: 2 },
  apartments: { min: 1, max: 12 },
  apartmentFeatures: { min: 0, max: 20 },
  apartmentPhotos: { min: 0, max: 12 },
  facilityGroups: { min: 1, max: 8 },
  facilities: { min: 1, max: 20 },
  nearbyPlaces: { min: 0, max: 20 },
  rules: { min: 1, max: 16 },
  galleryPhotos: { min: 0, max: 40 },
} as const;

export type ListLimitName = keyof typeof listLimits;
