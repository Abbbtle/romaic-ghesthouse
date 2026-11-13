import { ArrowUpRight } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { linkClasses } from "./text-link";
import { newTabHint, VisuallyHidden } from "./visually-hidden";

type ExternalLinkProps = Omit<ComponentProps<"a">, "target" | "children"> & {
  href: string;
  children: ReactNode;
};

/**
 * A link to another website, opening in a new tab: underlined, with a 16 px
 * arrow and "(opens in a new tab)" for screen readers (design-spec §3.3). It
 * stays inline, so it wraps with the sentence around it.
 */
export function ExternalLink({ href, className, children, ...anchorProps }: ExternalLinkProps) {
  return (
    <a {...anchorProps} href={href} target="_blank" rel="noopener noreferrer" className={linkClasses(className)}>
      {children}
      <ArrowUpRight aria-hidden="true" strokeWidth={2} className="ml-0.5 inline size-4 align-[-0.15em]" />
      {/* The space is read, not shown, so punctuation can sit right after the arrow. */}
      <VisuallyHidden> {newTabHint}</VisuallyHidden>
    </a>
  );
}
