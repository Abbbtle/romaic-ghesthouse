/**
 * Type roles as class recipes, so every page sets a role the same way
 * (brand guide p6). Headlines are Josefin Sans, upper case and tracked;
 * everything people read is Arimo; Sacramento is a rare, large, gold accent
 * (see `script`). Colours are roles (ink, fg-2…), so inside an .on-dark
 * surface they turn light by themselves.
 */
export const textStyles = {
  /** The page's one big headline. */
  hero: "font-display text-hero font-semibold tracking-[0.1em] uppercase text-ink",
  h1: "font-display text-h1 font-semibold tracking-[0.08em] uppercase text-ink",
  h2: "font-display text-h2 font-semibold tracking-[0.08em] uppercase text-ink",
  /** Card and apartment titles, sub-sections: Arimo bold, sentence case, so long names stay readable. */
  h3: "text-h3 font-bold text-ink",
  /** Small titles, amenity group names. */
  h4: "text-h4 font-bold text-ink",
  /** Tracked capitals for short labels inside a section (never as an eyebrow above a heading). */
  label: "font-display text-sm font-semibold uppercase tracking-[0.14em] text-fg-brand",
  /** Sacramento in gold: large only, and at most once in a view. */
  script: "font-script text-script font-normal text-fg-brand",
  lead: "max-w-[60ch] text-lead text-fg-2",
  body: "max-w-[65ch] text-base text-fg",
  secondary: "text-sm text-fg-2",
  /** Timestamps, helper and legal text: never primary content. */
  meta: "text-xs text-fg-3",
  /** Prices: Arimo bold with lining, tabular figures. */
  price: "text-price font-bold text-ink tabular-nums",
  /** Stat and KPI numbers. */
  stat: "text-stat font-bold text-ink tabular-nums",
} as const;

export type TextStyle = keyof typeof textStyles;
