import type { ReactNode } from "react";
import { WhatsAppGlyph } from "./whatsapp-glyph";
import { buttonClasses, type ButtonSize } from "./button";
import { cx } from "./cx";
import { VisuallyHidden, whatsappHint } from "./visually-hidden";

type WhatsAppButtonProps = {
  /** A wa.me link, built with whatsappLink() from src/lib/format/phone. */
  href: string;
  /** "Chat on WhatsApp", "WhatsApp us to book"… */
  children: ReactNode;
  /** On the navy contact bar: a gold-edged outline button instead of the navy one. */
  onDark?: boolean;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** The id of what the button belongs to, when its words alone don't say (several "Ask us" buttons on one page). */
  describedBy?: string;
  className?: string;
};

/**
 * WhatsApp is the main channel, so it gets its own button: black with the
 * green glyph on light surfaces, outlined on dark ones. It opens WhatsApp in
 * a new tab and says so to screen readers.
 */
export function WhatsAppButton({ href, children, onDark = false, size = "md", fullWidth, describedBy, className }: WhatsAppButtonProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-describedby={describedBy}
      className={buttonClasses({ variant: onDark ? "whatsapp-on-dark" : "whatsapp", size, fullWidth }, className)}
    >
      <WhatsAppGlyph className={cx("shrink-0", size === "sm" ? "size-4" : "size-5")} />
      {children} <VisuallyHidden>{whatsappHint}</VisuallyHidden>
    </a>
  );
}
