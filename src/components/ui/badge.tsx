import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * brand: a lit tag, such as "Sleeps 5": navy with a Cream label.
 * gold: a highlight on Cream, such as "Wheelchair accessible": a gold edge with gold text that reads (5.5:1).
 * on-dark: a tag on navy: Cream with a navy label.
 * neutral: a quiet fact: an outlined tag.
 */
export type BadgeTone = "brand" | "gold" | "on-dark" | "neutral";

const tones: Record<BadgeTone, string> = {
  brand: "border-midnight-navy bg-midnight-navy text-cream",
  gold: "border-romaic-gold bg-white text-gold-text",
  "on-dark": "border-cream bg-cream text-midnight-navy",
  neutral: "border-hairline-strong text-fg-2",
};

/**
 * A tag: a fact in sentence case. Square-shouldered, like the gold frames,
 * because it is not pressable (pills are). Text, not colour, carries the meaning.
 */
export function Badge({ tone = "brand", className, children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex min-h-7 w-fit items-center gap-1.5 rounded-xs border px-2.5 py-1 text-[0.8125rem] leading-none font-bold whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
