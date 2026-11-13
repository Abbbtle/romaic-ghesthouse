import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { Paragraphs } from "@/components/ui/paragraphs";
import { GoldBarHeading } from "./gold-bar-heading";

/**
 * The top of an inner page, the poster's way: the page's line in the gold
 * bar (its h1), then a short introduction. `children` sits beneath, such as
 * the address on the location page.
 */
export function PageHeading({ title, intro, children, className }: { title: string; intro?: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cx("grid justify-items-start gap-5", className)}>
      <GoldBarHeading as="h1" size="hero" sweep>
        {title}
      </GoldBarHeading>
      {intro && <Paragraphs text={intro} className="max-w-[60ch] text-lead text-fg-2" />}
      {children}
    </div>
  );
}

/** A page's body width and side gutters, the same on every public page. */
export function PageBand({ children, className, tone = "canvas" }: { children: ReactNode; className?: string; tone?: "canvas" | "cream" }) {
  return (
    <div className={tone === "cream" ? "bg-cream" : "bg-canvas"}>
      <div className={cx("mx-auto max-w-page px-[max(1rem,env(safe-area-inset-left))] py-section-sm", className)}>{children}</div>
    </div>
  );
}
