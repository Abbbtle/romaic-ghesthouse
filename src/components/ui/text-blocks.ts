/**
 * Plain text from content as paragraphs of lines: a blank line starts a new
 * paragraph, a single line break stays a break within one. Blank paragraphs
 * and stray spaces at the ends of lines are dropped, so text that was typed
 * with extra returns still reads cleanly.
 */
export function paragraphsOf(text: string): string[][] {
  return text
    .split(/\r?\n[^\S\r\n]*\r?\n\s*/)
    .map((paragraph) =>
      paragraph
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    )
    .filter((lines) => lines.length > 0);
}

/** The text as one paragraph, for places with room for a single block, such as a quote clamped to a few lines. */
export function asOneParagraph(text: string): string {
  return paragraphsOf(text)
    .map((lines) => lines.join(" "))
    .join(" ");
}
