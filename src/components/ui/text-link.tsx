import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

/**
 * Links in running text are always underlined, never told apart by colour
 * alone (design-spec §13). The colours are roles, so on navy surfaces
 * (.on-dark) the link turns white by itself.
 */
export function linkClasses(className?: string): string {
  return cx(
    "text-link underline decoration-current/40 decoration-1 underline-offset-4 transition-colors duration-150 hover:text-link-hover hover:decoration-current",
    className,
  );
}

/**
 * The site's quiet links (a call to action's tertiary look, "See the live
 * diary"): 600 in the link colour, 44 px tall. They are still underlined, but
 * the underline is drawn under the label, a <span className="quiet-link__label">,
 * so on hover and focus it can slide off and back on (globals.css, site motion).
 */
export const quietLinkClasses = "quiet-link inline-flex min-h-11 items-center font-semibold text-link transition-colors duration-150 hover:text-link-hover";

type TextLinkProps = Omit<ComponentProps<typeof Link>, "className" | "children"> & {
  className?: string;
  children: ReactNode;
};

/** An underlined link to a page of this site. */
export function TextLink({ className, ...linkProps }: TextLinkProps) {
  return <Link {...linkProps} className={linkClasses(className)} />;
}
