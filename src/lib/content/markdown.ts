import { placeholderAt, placeholderValue, type PlaceholderValues } from "./placeholders";

/**
 * The limited Markdown that legal text is written in (product-spec §8.1):
 * the Privacy Notice page and the booking form's privacy notice. One parser
 * checks the text when it's saved (markdownProblems) and turns it into
 * blocks for the page (parseMarkdown), so what passes validation is exactly
 * what renders. Pages render the blocks as React elements, never as an HTML
 * string.
 *
 * What it understands:
 * - Headings: "#" or "##" make a heading (level 2, since the page's own title
 *   is its only h1), "###" a subheading (3), "####" or deeper a minor one (4).
 * - Lists: lines starting "-", "*" or "+" make a bulleted list; "1." or "1)"
 *   a numbered one, counting from its first number. A line indented by two
 *   spaces or a tab carries on the item above it, after a line break.
 * - Paragraphs: other lines. A blank line separates paragraphs; a single
 *   line break inside one is kept.
 * - **bold** or __bold__, *italic* or _italic_. An underscore inside a word
 *   (snake_case, an_email@example.com) is just an underscore.
 * - [link text](address), where the address is https://…, mailto:…, tel:…
 *   or a page on this site ("/book"). Any other address is a problem when
 *   saving, and shows as plain text if it's ever met when rendering.
 * - A backslash shows the punctuation after it as it is: \* \_ \[ \{.
 * - {placeholders} are filled in from `values` as plain text, so a value is
 *   never read as formatting.
 *
 * Everything else (HTML, images, tables, code) shows as the text it is.
 */

// --- the parsed form -----------------------------------------------------------------------

/**
 * Inline content: text and the formatting around it.
 * - `text`: shown exactly as it is, placeholders already filled in.
 * - `strong`, `emphasis`: bold and italic, around their children.
 * - `link`: an address isAllowedHref accepts, around its text; never inside another link.
 * - `break`: a line break typed inside a paragraph or list item (render as `<br>`).
 */
export type MarkdownInline =
  | { type: "text"; text: string }
  | { type: "strong"; children: MarkdownInline[] }
  | { type: "emphasis"; children: MarkdownInline[] }
  | { type: "link"; href: string; children: MarkdownInline[] }
  | { type: "break" };

/** Headings start at 2: the page's own title is its only h1. */
export type MarkdownHeadingLevel = 2 | 3 | 4;

/**
 * A block of the text, in reading order.
 * - `heading`: its level (render as h2, h3 or h4) and inline content.
 * - `paragraph`: inline content, with `break`s where lines were broken.
 * - `list`: bulleted, or numbered from `start` (render as `<ol start>`); each item is its inline content.
 */
export type MarkdownBlock =
  | { type: "heading"; level: MarkdownHeadingLevel; children: MarkdownInline[] }
  | { type: "paragraph"; children: MarkdownInline[] }
  | { type: "list"; ordered: false; items: MarkdownInline[][] }
  | { type: "list"; ordered: true; start: number; items: MarkdownInline[][] };

/**
 * The blocks of a Markdown text, ready to render. Each {placeholder} with a
 * value in `values` is filled in as plain text, in link addresses too (which
 * are checked again once filled). Never throws: what it doesn't understand
 * is text.
 */
export function parseMarkdown(source: string, values: PlaceholderValues = {}): MarkdownBlock[] {
  return parseBlocks(source, { values, problems: [] });
}

/** What's wrong with a Markdown text, as messages for the editor, each once; empty when it's fine. */
export function markdownProblems(source: string): string[] {
  const context: ParseContext = { values: {}, problems: [] };
  parseBlocks(source, context);
  return [...new Set(context.problems)];
}

/**
 * Whether a link may be rendered: https addresses (without a user name or
 * password), mailto: and tel: links, and pages on this site ("/book",
 * "/privacy#rights"). Never javascript:, data:, http: or "//host", which
 * leaves the site.
 */
export function isAllowedHref(href: string): boolean {
  if (!href || /[\s\p{Cc}]/u.test(href)) return false;
  if (href.startsWith("/")) return !/^\/[/\\]/.test(href);
  if (/^(?:mailto|tel):./i.test(href)) return true;
  if (!/^https:\/\//i.test(href)) return false;
  const url = parsedUrl(href);
  return url !== null && url.protocol === "https:" && url.hostname !== "" && url.username === "" && url.password === "";
}

/** The address as a URL, or null. (URL.parse would do, but the editor still supports Safari 16.4.) */
function parsedUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

// --- blocks ------------------------------------------------------------------------------------

type ParseContext = {
  values: PlaceholderValues;
  /** Problems found on the way, for markdownProblems. */
  problems: string[];
};

// Each pattern runs in linear time: the editor checks long notices as the author types.
const blankLine = /^\s*$/;
const headingLine = /^ {0,3}(#{1,6})[ \t]+(.*)$/s;
const listItemLine = /^[ \t]*(?:[-*+]|(\d{1,9})[.)])[ \t]+(\S.*)$/s;
const continuationLine = /^(?: {2}|\t)/;

type OpenList = { ordered: boolean; start: number; items: string[][] };

function parseBlocks(source: string, context: ParseContext): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  // Lines gathered for the paragraph or list being read, parsed once it ends.
  const open: { paragraph: string[] | null; list: OpenList | null } = { paragraph: null, list: null };
  const closeParagraph = () => {
    if (open.paragraph) blocks.push({ type: "paragraph", children: parseInline(open.paragraph.join("\n"), context) });
    open.paragraph = null;
  };
  const closeList = () => {
    if (open.list) blocks.push(listBlock(open.list, context));
    open.list = null;
  };

  for (const line of source.split(/\r\n?|\n/)) {
    if (blankLine.test(line)) {
      closeParagraph();
      closeList();
      continue;
    }

    const heading = headingOf(line);
    if (heading) {
      closeParagraph();
      closeList();
      blocks.push({ type: "heading", level: heading.level, children: parseInline(heading.text, context) });
      continue;
    }

    const item = listItemLine.exec(line);
    const number = item?.[1];
    // A numbered line only interrupts a paragraph from 1, so a line such as "2026. Here we go" stays text.
    if (item && !(open.paragraph && number !== undefined && Number(number) !== 1)) {
      closeParagraph();
      const ordered = number !== undefined;
      if (open.list && open.list.ordered !== ordered) closeList();
      open.list ??= { ordered, start: ordered ? Number(number) : 1, items: [] };
      open.list.items.push([(item[2] ?? "").trim()]);
      continue;
    }

    const lastItem = open.list?.items.at(-1);
    if (lastItem && continuationLine.test(line)) {
      lastItem.push(line.trim());
      continue;
    }

    closeList();
    open.paragraph ??= [];
    open.paragraph.push(line.trim());
  }
  closeParagraph();
  closeList();
  return blocks;
}

function headingOf(line: string): { level: MarkdownHeadingLevel; text: string } | null {
  const match = headingLine.exec(line);
  if (!match) return null;
  // "## ##" has nothing to show, so it stays text rather than becoming an empty heading.
  const text = withoutClosingHashes((match[2] ?? "").trim());
  if (!text) return null;
  const hashes = (match[1] ?? "").length;
  return { level: hashes <= 2 ? 2 : hashes === 3 ? 3 : 4, text };
}

/** A heading's text without its optional closing hashes: "Rights ##" → "Rights"; "C#" stays as it is. */
function withoutClosingHashes(text: string): string {
  let end = text.length;
  while (end > 0 && text.charAt(end - 1) === "#") end -= 1;
  if (end === text.length) return text;
  if (end === 0) return "";
  return /[ \t]/.test(text.charAt(end - 1)) ? text.slice(0, end).trimEnd() : text;
}

function listBlock(list: OpenList, context: ParseContext): MarkdownBlock {
  const items = list.items.map((lines) => parseInline(lines.join("\n"), context));
  return list.ordered ? { type: "list", ordered: true, start: list.start, items } : { type: "list", ordered: false, items };
}

// --- inline ------------------------------------------------------------------------------------

type FormatKind = "strong" | "emphasis";

/** A run of * or _ that may open or close formatting: CommonMark's "delimiter run". */
type DelimiterRun = {
  kind: "delimiters";
  character: "*" | "_";
  /** The run's length as written. */
  length: number;
  /** Characters not used for formatting, which show as text. */
  remaining: number;
  canOpen: boolean;
  canClose: boolean;
  /** The formatting this run opens and closes, innermost first. */
  opens: FormatKind[];
  closes: FormatKind[];
};

type InlinePiece = { kind: "node"; node: MarkdownInline } | DelimiterRun;

/**
 * Inline content in three steps: read the text into nodes and delimiter
 * runs, pair the runs into bold and italic, then assemble the tree.
 */
function parseInline(text: string, context: ParseContext, insideLink = false): MarkdownInline[] {
  const pieces: InlinePiece[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) pieces.push(nodePiece({ type: "text", text: buffer }));
    buffer = "";
  };
  let brackets: Int32Array | null = null;

  let at = 0;
  while (at < text.length) {
    const character = text.charAt(at);

    if (character === "\\" && isAsciiPunctuation(text.charAt(at + 1))) {
      buffer += text.charAt(at + 1);
      at += 2;
      continue;
    }

    if (character === "{") {
      const placeholder = placeholderAt(text, at);
      if (placeholder) {
        buffer += placeholderValue(placeholder.name, context.values) ?? text.slice(at, placeholder.end);
        at = placeholder.end;
        continue;
      }
    }

    if (character === "\n") {
      flush();
      pieces.push(nodePiece({ type: "break" }));
      at += 1;
      continue;
    }

    if (character === "[" && !insideLink) {
      brackets ??= bracketIndex(text);
      const link = readLink(text, at, brackets);
      if (link) {
        flush();
        pieces.push(...linkPieces(link, context));
        at = link.end;
        continue;
      }
    }

    if (character === "*" || character === "_") {
      flush();
      const run = delimiterRun(text, at, character);
      pieces.push(run);
      at += run.length;
      continue;
    }

    buffer += character;
    at += 1;
  }
  flush();

  pairDelimiters(pieces);
  return assembleInline(pieces);
}

function nodePiece(node: MarkdownInline): InlinePiece {
  return { kind: "node", node };
}

// --- links

type LinkSyntax = { label: string; destination: string; end: number };

/**
 * Link addresses longer than this, or with parentheses nested deeper, aren't
 * read as links. Real addresses are far shorter and flatter, and the limits
 * keep text full of "[a](" linear to parse (as markdown-it does).
 */
const maxDestinationLength = 2_000;
const maxParenthesisDepth = 32;

/** "[label](destination)" starting at `at`: its parts and where it ends, or null when it isn't a link. */
function readLink(text: string, at: number, brackets: Int32Array): LinkSyntax | null {
  const labelEnd = brackets[at + 1] ?? -1;
  if (labelEnd === -1 || text.charAt(labelEnd) !== "]" || text.charAt(labelEnd + 1) !== "(") return null;
  const label = text.slice(at + 1, labelEnd);
  if (!label.trim()) return null;
  const destination = readDestination(text, labelEnd + 2);
  return destination && { label, destination: destination.raw, end: destination.end };
}

/** The address after "](": up to the ")" that closes it (parentheses inside must balance), without spaces. */
function readDestination(text: string, from: number): { raw: string; end: number } | null {
  let at = skipSpacesAndTabs(text, from);
  const start = at;
  let depth = 0;
  while (at < text.length && at - start < maxDestinationLength) {
    const character = text.charAt(at);
    if (character === "\\" && isAsciiPunctuation(text.charAt(at + 1))) {
      at += 2;
      continue;
    }
    if (isSpace(character)) break;
    if (character === ")") {
      if (depth === 0) break;
      depth -= 1;
    }
    if (character === "(" && ++depth > maxParenthesisDepth) return null;
    at += 1;
  }
  const raw = text.slice(start, at);
  const end = skipSpacesAndTabs(text, at);
  return raw && text.charAt(end) === ")" ? { raw, end: end + 1 } : null;
}

function skipSpacesAndTabs(text: string, from: number): number {
  let at = from;
  while (text.charAt(at) === " " || text.charAt(at) === "\t") at += 1;
  return at;
}

/**
 * For each position in `text`, where the next "[" or "]" that isn't
 * escaped stands (-1 for none). Built once per text, so finding the end of
 * every link label stays linear however many brackets there are.
 */
function bracketIndex(text: string): Int32Array {
  const escaped = new Uint8Array(text.length);
  for (let at = 1; at < text.length; at += 1) {
    if (text.charAt(at - 1) === "\\" && escaped[at - 1] === 0) escaped[at] = 1;
  }
  const next = new Int32Array(text.length + 1).fill(-1);
  for (let at = text.length - 1; at >= 0; at -= 1) {
    const character = text.charAt(at);
    next[at] = (character === "[" || character === "]") && escaped[at] === 0 ? at : (next[at + 1] ?? -1);
  }
  return next;
}

/** A link as pieces: the link, or (when its address isn't allowed) just its words, with a problem noted. */
function linkPieces(link: LinkSyntax, context: ParseContext): InlinePiece[] {
  const children = parseInline(link.label, context, true);
  const href = literalText(link.destination, context.values);
  if (isAllowedHref(href)) return [nodePiece({ type: "link", href, children })];
  context.problems.push(unsafeLinkProblem(children));
  return children.map(nodePiece);
}

function unsafeLinkProblem(label: readonly MarkdownInline[]): string {
  const words = plainText(label).replace(/\s+/g, " ").trim();
  const shown = words.length > 40 ? `${words.slice(0, 39)}…` : words;
  return `Fix the link "${shown}": links must start with https://, mailto: or tel:, or be a page on this site such as /book.`;
}

/** Text with its escapes and placeholders worked out, for link addresses. */
function literalText(raw: string, values: PlaceholderValues): string {
  let text = "";
  let at = 0;
  while (at < raw.length) {
    const character = raw.charAt(at);
    if (character === "\\" && isAsciiPunctuation(raw.charAt(at + 1))) {
      text += raw.charAt(at + 1);
      at += 2;
      continue;
    }
    const placeholder = character === "{" ? placeholderAt(raw, at) : null;
    if (placeholder) {
      text += placeholderValue(placeholder.name, values) ?? raw.slice(at, placeholder.end);
      at = placeholder.end;
      continue;
    }
    text += character;
    at += 1;
  }
  return text;
}

function plainText(nodes: readonly MarkdownInline[]): string {
  return nodes.map((node) => (node.type === "text" ? node.text : node.type === "break" ? " " : plainText(node.children))).join("");
}

// --- bold and italic

/**
 * The run of `character` starting at `at`, and whether it can open or close
 * formatting, by the characters on either side (CommonMark's flanking
 * rules): "**bold**" opens and closes; "5 * 3" does neither.
 */
function delimiterRun(text: string, at: number, character: "*" | "_"): DelimiterRun {
  let end = at;
  while (text.charAt(end) === character) end += 1;
  const before = text.charAt(at - 1);
  const after = text.charAt(end);
  const leftFlanking = !isSpace(after) && (!isPunctuation(after) || isSpace(before) || isPunctuation(before));
  const rightFlanking = !isSpace(before) && (!isPunctuation(before) || isSpace(after) || isPunctuation(after));
  const canOpen = character === "*" ? leftFlanking : leftFlanking && (!rightFlanking || isPunctuation(before));
  const canClose = character === "*" ? rightFlanking : rightFlanking && (!leftFlanking || isPunctuation(after));
  const length = end - at;
  return { kind: "delimiters", character, length, remaining: length, canOpen, canClose, opens: [], closes: [] };
}

/**
 * Pairs delimiter runs into bold and italic, as CommonMark's "process
 * emphasis" does. Each run that can close takes the nearest run before it
 * that can open with the same character: two characters from each for bold
 * when both have them, otherwise one for italic, repeating while it has
 * characters left. Runs left between a pair become text. Openers that failed
 * a kind of closer are never tried again for it (`bottoms`), and matched
 * stretches are stepped over (`skips`), so text full of stray markers stays
 * fast.
 */
function pairDelimiters(pieces: readonly InlinePiece[]): void {
  const bottoms = new Map<string, number>();
  const skips = new Map<number, number>();
  const previous = (index: number) => skips.get(index) ?? index - 1;

  pieces.forEach((closer, closerIndex) => {
    if (closer.kind !== "delimiters") return;
    while (closer.canClose && closer.remaining > 0) {
      const bottomKey = `${closer.character}${closer.canOpen ? "+" : "-"}${closer.length % 3}`;
      const opener = findOpener(pieces, closer, previous(closerIndex), bottoms.get(bottomKey) ?? -1, previous);
      if (!opener) {
        bottoms.set(bottomKey, closerIndex - 1);
        return;
      }
      const used = opener.run.remaining >= 2 && closer.remaining >= 2 ? 2 : 1;
      const kind: FormatKind = used === 2 ? "strong" : "emphasis";
      opener.run.remaining -= used;
      closer.remaining -= used;
      opener.run.opens.push(kind);
      closer.closes.push(kind);
      for (let index = previous(closerIndex); index > opener.index; index = previous(index)) {
        const between = pieces[index];
        if (between?.kind === "delimiters") {
          between.canOpen = false;
          between.canClose = false;
        }
      }
      skips.set(closerIndex, opener.index);
    }
  });
}

function findOpener(
  pieces: readonly InlinePiece[],
  closer: DelimiterRun,
  from: number,
  bottom: number,
  previous: (index: number) => number,
): { run: DelimiterRun; index: number } | null {
  for (let index = from; index > bottom; index = previous(index)) {
    const run = pieces[index];
    if (run?.kind !== "delimiters" || run.character !== closer.character || !run.canOpen || run.remaining === 0) continue;
    if (!breaksRuleOfThree(run, closer)) return { run, index };
  }
  return null;
}

/** CommonMark's "rule of 3", which keeps "*a**b*" one italic rather than pairing the wrong markers. */
function breaksRuleOfThree(opener: DelimiterRun, closer: DelimiterRun): boolean {
  if (!opener.canClose && !closer.canOpen) return false;
  return (opener.length + closer.length) % 3 === 0 && !(opener.length % 3 === 0 && closer.length % 3 === 0);
}

/** The tree from the paired pieces: each run closes, shows its unused characters, then opens. */
function assembleInline(pieces: readonly InlinePiece[]): MarkdownInline[] {
  const root: MarkdownInline[] = [];
  const formats: { kind: FormatKind; children: MarkdownInline[] }[] = [];
  const add = (node: MarkdownInline) => appendInline(formats.at(-1)?.children ?? root, node);

  for (const piece of pieces) {
    if (piece.kind === "node") {
      add(piece.node);
      continue;
    }
    for (let count = piece.closes.length; count > 0; count -= 1) {
      const format = formats.pop();
      if (format && format.children.length > 0) add({ type: format.kind, children: format.children });
    }
    if (piece.remaining > 0) add({ type: "text", text: piece.character.repeat(piece.remaining) });
    for (const kind of [...piece.opens].reverse()) formats.push({ kind, children: [] });
  }
  return root;
}

/** Adds `node` to `nodes`, joining it to text just before it. */
function appendInline(nodes: MarkdownInline[], node: MarkdownInline): void {
  const last = nodes.at(-1);
  if (node.type === "text" && last?.type === "text") nodes[nodes.length - 1] = { type: "text", text: last.text + node.text };
  else nodes.push(node);
}

// --- characters

/** CommonMark's backslash-escapable characters: ASCII punctuation. */
function isAsciiPunctuation(character: string): boolean {
  const code = character.charCodeAt(0);
  return (code >= 0x21 && code <= 0x2f) || (code >= 0x3a && code <= 0x40) || (code >= 0x5b && code <= 0x60) || (code >= 0x7b && code <= 0x7e);
}

/** Whitespace, or the start or end of the text (""). */
function isSpace(character: string): boolean {
  return character === "" || /\s/u.test(character);
}

function isPunctuation(character: string): boolean {
  return /[\p{P}\p{S}]/u.test(character);
}
