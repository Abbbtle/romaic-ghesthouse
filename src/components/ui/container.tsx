import type { ReactNode } from "react";
import { cx } from "./cx";

type ContainerProps = {
  /** The element to render; a plain div by default. */
  as?: "div" | "header" | "footer" | "nav" | "section" | "article";
  className?: string;
  children: ReactNode;
};

/**
 * The page column: 1280 px at most including gutters, which are 16 px on
 * phones, 24 px from 640 px and 32 px from 1024 px (design-spec §4.2).
 */
export function Container({ as: Element = "div", className, children }: ContainerProps) {
  return <Element className={cx("mx-auto w-full max-w-page px-4 sm:px-6 lg:px-8", className)}>{children}</Element>;
}
