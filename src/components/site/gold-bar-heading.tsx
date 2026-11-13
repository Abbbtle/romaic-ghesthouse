import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

/**
 * A headline held in the gold frame bar, set the way the brand guide sets it
 * (p8, p10): bold Arimo in ink on the brand's 100° gold gradient ("Spacious
 * Apartments"), not Josefin capitals, which belong to section headings and
 * labels. One per view at most, for the line the page is about. `sweep` lets
 * the motion gate play the bar's one gold sweep after the visitor interacts.
 */
export function GoldBarHeading({
  as: Tag = "h2",
  children,
  size = "h2",
  sweep = false,
  className,
}: {
  as?: "h1" | "h2" | "h3";
  /** h2 for a section's line; hero for the page's one headline. */
  size?: "h2" | "hero";
  children: ReactNode;
  sweep?: boolean;
  className?: string;
}) {
  return (
    <Tag
      data-sweep={sweep ? "" : undefined}
      className={cx(
        "gold-bar font-sans font-bold tracking-[-0.005em]",
        size === "hero" ? "text-[clamp(1.625rem,1.25rem+1.6vw,2.5rem)] leading-[1.15]" : "text-[clamp(1.25rem,1.1rem+0.7vw,1.625rem)] leading-tight",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
