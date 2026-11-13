import { z } from "zod";
import { parsePhoneNumber } from "@/lib/format/phone";
import { isIsoDate } from "@/lib/format/zoned-time";
import { textLimits } from "./limits";
import { markdownProblems } from "./markdown";
import { placeholderProblem } from "./placeholders";

/**
 * The building blocks the section schemas are made of. Every message leads
 * with the fix and names the field ("Keep the headline to 30 characters."),
 * since the same schemas run in the editor for instant feedback and on the
 * server, which always checks again.
 */

// --- text ----------------------------------------------------------------------

/**
 * Text as people should have typed it. Control characters (except tabs and
 * line breaks) have no place in site copy, so they're dropped; unpaired
 * surrogates, which no keyboard produces, become U+FFFD.
 */
export function storableText(text: string): string {
  let kept = "";
  for (const character of text.toWellFormed()) {
    const code = character.codePointAt(0) ?? 0;
    const control = code < 0x20 || (code >= 0x7f && code <= 0x9f);
    if (!control || code === 0x09 || code === 0x0a || code === 0x0d) kept += character;
  }
  return kept;
}

/** One line, as from a single-line field: storable, trimmed, each run of whitespace one space. */
export function singleLineText(text: string): string {
  return storableText(text).trim().replace(/\s+/g, " ");
}

/** Text that may run over several lines: storable, with Windows line endings normalised, trimmed. */
export function multilineText(text: string): string {
  return storableText(text).replace(/\r\n?/g, "\n").trim();
}

export type TextRules = {
  /** How messages name the field, with its article: "the headline", "each focus area". */
  noun: string;
  max: number;
  /** The message when it's left empty. Without one the text is optional and may be "". */
  required?: string;
  /** Keeps line breaks (paragraphs, quotes); otherwise the text is one line. */
  multiline?: boolean;
};

/** Plain text, tidied as it's read, with a length limit and, when `required`, a message for an empty field. */
export function textField({ noun, max, required, multiline = false }: TextRules) {
  const base = z.string({ error: `Enter ${noun}.` }).overwrite(multiline ? multilineText : singleLineText);
  const filled = required ? base.min(1, required) : base;
  return filled.max(max, tooLongMessage(noun, max));
}

export function tooLongMessage(noun: string, max: number): string {
  return `Keep ${noun} to ${countOf(max)} characters.`;
}

/** Text that may fill in {placeholders}, but only the ones listed. */
export function placeholderTextField(rules: TextRules & { placeholders: readonly string[] }) {
  return textField(rules).superRefine((value, context) => {
    const problem = placeholderProblem(value, rules.placeholders);
    if (problem) context.addIssue({ code: "custom", message: problem });
  });
}

/** Limited Markdown (see ./markdown) that may fill in the listed {placeholders}. */
export function markdownField(rules: Omit<TextRules, "multiline"> & { placeholders: readonly string[] }) {
  return textField({ ...rules, multiline: true }).superRefine((value, context) => {
    const problem = markdownProblems(value)[0] ?? placeholderProblem(value, rules.placeholders);
    if (problem) context.addIssue({ code: "custom", message: problem });
  });
}

// --- identifiers, numbers and dates ------------------------------------------------

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A short name used in links and as a record's id, such as "one-to-one". */
export function slugField(noun: string) {
  return z
    .string({ error: `Enter ${noun}.` })
    .min(1, `Enter ${noun}.`)
    .max(textLimits.slug, tooLongMessage(noun, textLimits.slug))
    .regex(slugPattern, slugMessage(noun));
}

/** A slug that may also be left empty (""). */
export function optionalSlugField(noun: string) {
  return z
    .string({ error: `Enter ${noun}.` })
    .max(textLimits.slug, tooLongMessage(noun, textLimits.slug))
    .refine((value) => value === "" || slugPattern.test(value), slugMessage(noun));
}

function slugMessage(noun: string): string {
  return `Use lower-case letters, numbers and single dashes for ${noun}, like one-to-one.`;
}

/** A whole number from `min` to `max`, such as sessions per month. */
export function wholeNumberField({ noun, min, max }: { noun: string; min: number; max: number }) {
  const range = `Enter ${noun} from ${countOf(min)} to ${countOf(max)}.`;
  return z.number({ error: `Enter ${noun} as a number.` }).int(`Enter ${noun} as a whole number.`).min(min, range).max(max, range);
}

/** A price in whole rands (R4,400 is 4400). */
export const priceField = z
  .number({ error: "Enter a price in rand, like 4400." })
  .int("Enter whole rands, like 4400.")
  .min(1, "Enter a price of at least R1.")
  .max(1_000_000, "Enter a price up to R1,000,000.");

/** A calendar date, "2026-10-20". */
export function isoDateField(noun: string) {
  return z.string({ error: `Enter ${noun}.` }).refine(isIsoDate, `Enter ${noun} as a date like 2026-10-20.`);
}

/** A version such as "1.0" or "2". */
export const versionField = z
  .string({ error: "Enter a version number, like 1.0." })
  .max(textLimits.version, tooLongMessage("the version", textLimits.version))
  .regex(/^\d{1,6}(?:\.\d{1,6}){0,3}$/, "Use numbers separated by dots for the version, like 1.0.");

/** A whole percentage, 0–100, such as where a photo's focus point sits. */
export const percentField = z.number({ error: "Enter a percentage." }).int("Enter a whole percentage.").min(0, "Enter 0 to 100.").max(100, "Enter 0 to 100.");

// --- contact details ---------------------------------------------------------------

/**
 * A phone number, typed any way South Africans write one ("082 123 4567",
 * "+27 82 123 4567") and stored in E.164 ("+27821234567").
 */
export function phoneField(noun: string) {
  return z.string({ error: `Enter ${noun}.` }).transform((value, context) => {
    const parsed = parsePhoneNumber(value);
    if (parsed.ok) return parsed.e164;
    context.issues.push({
      code: "custom",
      input: value,
      message: parsed.reason === "empty" ? `Enter ${noun}.` : `Enter ${noun} like 082 123 4567 or +27 82 123 4567.`,
    });
    return z.NEVER;
  });
}

export const emailField = z
  .string({ error: "Enter an email address like name@example.com." })
  .overwrite((value) => value.trim())
  .max(textLimits.email, tooLongMessage("the email address", textLimits.email))
  .pipe(z.email({ error: "Enter an email address like name@example.com." }));

/**
 * An https address, optionally only on certain sites (`hosts`, matched with
 * their subdomains), with an example for the message.
 */
export function httpsUrlField({ noun, example, hosts }: { noun: string; example: string; hosts?: readonly string[] }) {
  return z
    .string({ error: `Enter ${noun}.` })
    .overwrite((value) => value.trim())
    .max(textLimits.url, tooLongMessage(noun, textLimits.url))
    .superRefine((value, context) => {
      const problem = httpsUrlProblem(value, { noun, example, hosts });
      if (problem) context.addIssue({ code: "custom", message: problem });
    });
}

/** What's wrong with an address that must be https (and, with `hosts`, on one of those sites), or null. */
export function httpsUrlProblem(value: string, { noun, example, hosts }: { noun: string; example: string; hosts?: readonly string[] }): string | null {
  const url = parsedUrl(value);
  if (!url || url.protocol !== "https:" || !url.hostname || url.username || url.password) {
    return `Enter ${noun} starting with https://, like ${example}.`;
  }
  if (hosts && !isOnHost(url.hostname, hosts)) {
    return `Enter ${noun} on ${hosts[0]}, like ${example}.`;
  }
  return null;
}

export type OptionalHttpsUrlRules = {
  /** How messages name the field, with its article: "the payment link". */
  noun: string;
  /** The sites the address must be on, each with its subdomains: pay.yoco.com is on yoco.com. */
  hosts: readonly string[];
  /** The longest address it takes, textLimits.url unless given. */
  max?: number;
  /** The message for anything that isn't a plain https address on one of those sites. It names them in words. */
  message: string;
  /**
   * Parameters the address may not carry, in its query or as key=value
   * pairs in its fragment, and the message when it does. Names match
   * however they're written: "Email", " email" and "email[]" are "email".
   */
  refusedParameters?: { names: readonly string[]; message: string };
};

/**
 * An https address on one of `hosts`, or "" for none. "" is valid in
 * itself, as with optionalSlugField, so the field can take .default("")
 * inside list items: a plain httpsUrlField with that default would let the
 * "" it saved fail the next read and send the whole section back to the seed.
 *
 * It's stricter than httpsUrlField, for addresses visitors are sent to:
 * "https://" in full, nothing blank or invisible anywhere, the host written
 * as browsers read it, no user name or password, only the default port, and
 * none of the `refusedParameters`.
 *
 * Stored sections are checked again each time they're read, and one that
 * fails shows the seed instead. So once addresses are saved, these rules
 * and the `hosts` a field is given may only loosen: a tighter rule, or a
 * host taken off the list, would swap a saved pricing page for the seed's.
 */
export function optionalHttpsUrlField(rules: OptionalHttpsUrlRules) {
  const max = rules.max ?? textLimits.url;
  return z
    .string({ error: `Enter ${rules.noun}.` })
    .overwrite((value) => value.trim())
    .max(max, tooLongMessage(rules.noun, max))
    .superRefine((value, context) => {
      const problem = value === "" ? null : strictHttpsUrlProblem(value, rules);
      if (problem) context.addIssue({ code: "custom", message: problem });
    });
}

/**
 * The start an address needs to leave this site. new URL reads
 * "https:/paystack.com/…" and "https:paystack.com/…" as paystack.com, but a
 * link on one of this site's https pages takes them as paths of this site,
 * so they'd open a missing page here. Only "https://" counts, as in
 * isAllowedHref.
 */
const fullHttpsPattern = /^https:\/\//i;

/**
 * Whitespace, control characters and invisible format characters (Unicode
 * category Cf), such as a zero-width space, a soft hyphen or a
 * right-to-left mark, which can come along when a link is copied. new URL
 * would quietly encode them into an address the gateway doesn't know, and
 * in a WhatsApp message the direction marks can make a link read
 * differently from where it goes.
 */
const blankOrInvisiblePattern = /[\s\p{Cc}\p{Cf}]/u;

function strictHttpsUrlProblem(value: string, { hosts, message, refusedParameters }: OptionalHttpsUrlRules): string | null {
  const url = fullHttpsPattern.test(value) && !blankOrInvisiblePattern.test(value) ? parsedUrl(value) : null;
  if (!url || url.protocol !== "https:" || !url.hostname || url.username || url.password || url.port) return message;
  if (!hostReadsAsWritten(value, url) || !isOnHost(url.hostname, hosts)) return message;
  if (refusedParameters && carriesParameter(url, refusedParameters.names)) return refusedParameters.message;
  return null;
}

/**
 * Whether the address names the host new URL read, as written. The address
 * is stored and sent as written, in WhatsApp messages too, but it's checked
 * as new URL reads it, the way a browser does, and the two can differ:
 * - a backslash is a "/" to a browser only: it opens
 *   "https://paystack.com\@evil.io/x" on paystack.com, while other readers
 *   (Python's urlsplit, for one) take it to evil.io;
 * - new URL tidies a host up first: full-width letters, an escaped dot
 *   ("paystack%2Ecom"), an ideographic full stop and a third slash after
 *   "https:" all come out as plain paystack.com, a host the address as
 *   written doesn't name.
 * So there's no backslash, and the host as written, in any case and with
 * or without the default port, is the one new URL read.
 */
function hostReadsAsWritten(value: string, url: URL): boolean {
  const writtenHost = value.slice("https://".length).split(/[/?#]/, 1)[0]?.toLowerCase();
  return !value.includes("\\") && (writtenHost === url.host || writtenHost === `${url.host}:443`);
}

/** Whether a host name is one of `hosts` or a subdomain of one: www.google.com is on google.com, evil-google.com isn't. */
function isOnHost(hostname: string, hosts: readonly string[]): boolean {
  return hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

/**
 * Whether the address carries any of these parameters: in its query, or as
 * a key=value pair in its fragment ("#email=…"), which a payment page's
 * script can read just as well.
 */
function carriesParameter(url: URL, names: readonly string[]): boolean {
  const refused = new Set(names.map(parameterName));
  return [...url.searchParams.keys(), ...fragmentPairNames(url.hash)].some((name) => refused.has(parameterName(name)));
}

/**
 * A parameter's name as a page would most likely read it: without the
 * spaces around it, whatever its case, and without the "[]" that marks a
 * list, so "?Email[]=…" and "?email+=…" (a space, once decoded) count as
 * "email".
 */
function parameterName(name: string): string {
  return name.trim().toLowerCase().replace(/\[\]$/, "").trimEnd();
}

/** The names of the fragment's key=value pairs, decoded as a query's are: "#ref=BF-7K2QX&email=…" has ref and email. A plain "#top" has none. */
function fragmentPairNames(hash: string): string[] {
  const pairs = hash.slice(1).split("&").filter((pair) => pair.includes("="));
  return pairs.flatMap((pair) => [...new URLSearchParams(pair).keys()]);
}

/** The address as a URL, or null. (URL.parse would do, but the editor still supports Safari 16.4.) */
function parsedUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

// --- lists -----------------------------------------------------------------------

/**
 * A list of `item`s with its bounds from ./limits, and messages that name
 * the items: "Add at least 3 focus areas.", "Keep it to 4 plans."
 */
export function listField<Item extends z.ZodType>(
  item: Item,
  { min, max }: { readonly min: number; readonly max: number },
  noun: { one: string; many: string },
) {
  const fewest = min === 1 ? `Add at least one ${noun.one}.` : `Add at least ${countOf(min)} ${noun.many}.`;
  return z
    .array(item, { error: `Add a list of ${noun.many}.` })
    .min(min, fewest)
    .max(max, `Keep it to ${countOf(max)} ${max === 1 ? noun.one : noun.many}.`);
}

/**
 * Adds a message to every item after the first that repeats an earlier one's
 * key, at that item's `field`. For ids and link names that must be unique.
 */
export function refineUnique<Item>(
  items: readonly Item[],
  context: Pick<z.RefinementCtx, "addIssue">,
  { key, field, message }: { key: (item: Item) => string; field: string; message: string },
): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    const value = key(item);
    if (seen.has(value)) context.addIssue({ code: "custom", path: [index, field], message });
    seen.add(value);
  });
}

/** 1200 → "1,200": the same in every browser, unlike toLocaleString. */
function countOf(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
