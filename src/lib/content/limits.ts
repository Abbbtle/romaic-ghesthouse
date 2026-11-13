/**
 * How much each piece of site content may hold. The schemas in ./schema
 * enforce these numbers, and editors use the same ones for `maxLength` and
 * their counters, so the form and the server always agree. Text at its
 * limit still fits the fixed layouts.
 *
 * Phase 1 holds the sections the whole site shares (business details,
 * contact details, search results, the privacy notice). Phase 2 adds the
 * pages' own limits here.
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

  /** Link names and record ids, such as "family-room". */
  slug: 48,
} as const;

export type TextLimitName = keyof typeof textLimits;

/**
 * Soft budgets from the design: longer text still saves, but the editor
 * warns that long lines may wrap on phones. None yet; Phase 2's page
 * headlines add theirs.
 */
export const designBudgets = {} as const satisfies Partial<Record<TextLimitName, number>>;

/** The fewest and most items each list may hold. */
export const listLimits = {
  socialLinks: { min: 0, max: 6 },
} as const;

export type ListLimitName = keyof typeof listLimits;
