/**
 * A heading as content stores it: plain text, or two parts, plain and accent
 * ("Welcome to" / "Romaic Guesthouse"), the way the live site wrote them.
 */
export type HeadingText = string | { plain: string; accent: string };

/**
 * The heading as one line of text, for display, page titles and labels. Both
 * parts are set the same way: the design never colours part of a headline
 * (design-spec §3.3), so the accent is kept in content but not styled.
 */
export function headingToString(heading: HeadingText): string {
  if (typeof heading === "string") return heading;
  return [heading.plain, heading.accent].map((part) => part.trim()).filter(Boolean).join(" ");
}
