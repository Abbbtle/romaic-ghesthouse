/**
 * The public site's type roles, as class recipes (the approved premium
 * direction, 2026-11-13). Display headings are Josefin Sans light, large and
 * in sentence case, tracked no wider than 0.04em; titles, labels, buttons and
 * the nav are Josefin at 400-600; everything people read is Arimo at 17 px.
 * Colours are roles (ink, fg-2, fg-brand), so inside an .on-dark surface they
 * turn light by themselves. The dashboard keeps its own recipes
 * (src/components/ui/typography.ts).
 */
export const siteText = {
  /** The home page's one headline, over the photograph. */
  hero: "font-display text-display-hero font-light tracking-[-0.01em] text-balance",
  /** An inner page's h1. */
  page: "font-display text-display-page font-light tracking-[-0.01em] text-ink text-balance",
  /** A section's h2 on the home page. */
  section: "font-display text-display font-light tracking-[-0.01em] text-ink text-balance",
  /** A heading inside a page's body: "In the room", "Nearby". */
  sub: "font-display text-display-sm font-light tracking-[-0.005em] text-ink text-balance",
  /** Room names and block titles. */
  title: "font-display text-title font-normal text-ink",
  /** Smaller titles: room names in a row of four, info blocks, footer headings. */
  titleSm: "font-display text-title-sm font-normal text-ink",
  /** Short labels on fields and facts, in gold (Gold Text on light, Romaic Gold on navy). */
  label: "font-display text-label font-semibold tracking-[0.04em] text-fg-brand",
  /** The paragraph under a heading. */
  lede: "max-w-[34em] text-lede text-fg-2",
  body: "max-w-[65ch] text-base text-fg",
  secondary: "text-[0.9375rem] leading-normal text-fg-2",
  /** A link that reads as one: bold, with a gold underline that turns the text colour on hover. */
  link: "font-bold text-link underline decoration-romaic-gold decoration-2 underline-offset-[6px] transition-[text-decoration-color] hover:decoration-current",
} as const;

export type SiteTextRole = keyof typeof siteText;
