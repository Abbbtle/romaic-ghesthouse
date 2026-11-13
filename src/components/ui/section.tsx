import type { ReactNode } from "react";
import { Container } from "./container";
import { cx } from "./cx";
import { headingToString, type HeadingText } from "./heading-text";
import { textStyles } from "./typography";

/** Sections alternate white and chalk for structure (design-spec §9). Forest fills are brand moments, not section backgrounds. */
export type SectionTone = "white" | "chalk";

/**
 * Hands out section backgrounds in turn, starting with `first`: call it once
 * for each section as it renders, so a section that content hides (the home
 * page's amenities, say) never leaves two of the same tone side by side.
 */
export function alternatingTones(first: SectionTone): () => SectionTone {
  let next = first;
  return () => {
    const tone = next;
    next = tone === "white" ? "chalk" : "white";
    return tone;
  };
}

/** default: 64 → 128 px top and bottom; compact: 48 → 80 px (CTA band wrappers, pricing sub-sections). */
export type SectionSpacing = "default" | "compact" | "none";

const tones: Record<SectionTone, string> = { white: "bg-white", chalk: "bg-chalk" };
const spacings: Record<SectionSpacing, string> = { default: "py-section", compact: "py-section-sm", none: "" };

type SectionProps = {
  tone?: SectionTone;
  spacing?: SectionSpacing;
  /** An anchor target such as "about" (for /#about). */
  id?: string;
  /** The id of the section's heading, which names the region. */
  labelledBy?: string;
  /** Puts the content in the page column. Off for layouts that place their own. */
  contained?: boolean;
  className?: string;
  children: ReactNode;
};

/** A full-width band of the page with its content in the page column. */
export function Section({ tone = "white", spacing = "default", id, labelledBy, contained = true, className, children }: SectionProps) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cx(tones[tone], spacings[spacing], className)}>
      {contained ? <Container>{children}</Container> : children}
    </section>
  );
}

type SectionHeaderProps = {
  heading: HeadingText;
  /** 2 for a section's H2 (the default); 1 for a page's own heading at the top of an inner page. */
  level?: 1 | 2;
  /** For the section's aria-labelledby. */
  id?: string;
  /** A triad set quietly under the heading, in the text green. */
  subhead?: ReactNode;
  /** One or two sentences introducing the section (60 characters a line at most). */
  lead?: ReactNode;
  /** A link opposite the heading from md up, e.g. a ghost "See all pricing". */
  action?: ReactNode;
  /** Anything else that belongs to the header, such as a longer description. */
  children?: ReactNode;
  className?: string;
};

/**
 * A section's heading, left aligned like everything else: no eyebrows, no
 * centred stacks, no decorative rules (design-spec §6.4). Leaves 40 px (48 px
 * on large screens) before the content. The action comes last, after the
 * introduction, so on phones it reads as where to go next; from 768 px it
 * moves up opposite the heading.
 */
export function SectionHeader({ heading, level = 2, id, subhead, lead, action, children, className }: SectionHeaderProps) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <header className={cx("mb-10 grid md:grid-cols-[minmax(0,1fr)_auto] md:gap-x-8 lg:mb-12", className)}>
      <Heading id={id} className={cx("md:col-start-1", level === 1 ? textStyles.h1 : textStyles.h2)}>
        {headingToString(heading)}
      </Heading>
      {subhead && <p className={cx("mt-4 md:col-start-1", textStyles.lead)}>{subhead}</p>}
      {lead && <p className={cx("mt-4 md:col-start-1", textStyles.lead)}>{lead}</p>}
      {children && <div className={cx("mt-4 md:col-start-1", textStyles.body)}>{children}</div>}
      {action && <div className="mt-4 md:col-start-2 md:row-start-1 md:mt-0 md:self-end">{action}</div>}
    </header>
  );
}
