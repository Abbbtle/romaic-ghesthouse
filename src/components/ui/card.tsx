import type { ReactNode } from "react";
import { cx } from "./cx";

/** white for cards on white or chalk sections; chalk for a card that sits apart (the online coaching card). */
export type CardTone = "white" | "chalk";

const tones: Record<CardTone, string> = { white: "bg-white", chalk: "bg-chalk" };

type CardProps = {
  tone?: CardTone;
  as?: "div" | "article" | "li" | "section" | "figure";
  /** Lays the content out as a column, so a footer can sit at the bottom with mt-auto (pricing cards). */
  column?: boolean;
  className?: string;
  labelledBy?: string;
  children: ReactNode;
};

/**
 * The level-1 surface: a hairline frame, 10 px corners, no shadow, 20 px
 * padding (28 px from 1024 px). Cards are never links as a whole, which keeps
 * links and buttons inside them from nesting (design-spec §6.7).
 */
export function Card({ tone = "white", as: Element = "div", column = false, className, labelledBy, children }: CardProps) {
  return (
    <Element aria-labelledby={labelledBy} className={cx("rounded-md border border-hairline p-5 lg:p-7", tones[tone], column && "flex flex-col", className)}>
      {children}
    </Element>
  );
}
