import type { ReactNode } from "react";

/**
 * Text for screen readers only, such as " per month" after a price or
 * "(opens in a new tab)" after a link. It stays in the reading order and is
 * read as part of its parent's accessible name.
 */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

/** What links that leave the page say about it (design-spec §13). */
export const newTabHint = "(opens in a new tab)";
export const whatsappHint = "(opens WhatsApp)";
