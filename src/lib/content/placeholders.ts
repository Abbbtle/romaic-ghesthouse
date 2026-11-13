/**
 * Text that mentions facts stored elsewhere uses {name} placeholders, so the
 * fact is stored once and never goes out of date: the booking consent notice
 * says "{businessName} ({location}, {email})" and shows whatever the business
 * details say today. Each field that allows placeholders names the ones it
 * may use; anything else in braces is a mistake the editor is told about.
 */

/** What each placeholder name fills in: { email: "guesthouseromaic@gmail.com" }. */
export type PlaceholderValues = Readonly<Record<string, string>>;

const placeholderPattern = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

/** The {name}s a text uses, in order of first use. */
export function placeholdersIn(text: string): string[] {
  const names = new Set<string>();
  for (const match of text.matchAll(placeholderPattern)) names.add(match[1] ?? "");
  return [...names];
}

/** The text with each {name} that has a value replaced by it. Names without a value stay as they are. */
export function fillPlaceholders(text: string, values: PlaceholderValues): string {
  return text.replace(placeholderPattern, (whole: string, name: string) => placeholderValue(name, values) ?? whole);
}

/**
 * The placeholder that starts exactly at `index` ("{email}" in "Email {email}"
 * at 6), with the index just after it, or null when none does. For parsers
 * that read placeholders as they go, such as ./markdown.
 */
export function placeholderAt(text: string, index: number): { name: string; end: number } | null {
  const pattern = /\{([A-Za-z][A-Za-z0-9]*)\}/y;
  pattern.lastIndex = index;
  const match = pattern.exec(text);
  return match ? { name: match[1] ?? "", end: index + match[0].length } : null;
}

/** The value for placeholder `name`, or null when there's none (names such as "toString" never count). */
export function placeholderValue(name: string, values: PlaceholderValues): string | null {
  return Object.hasOwn(values, name) ? (values[name] ?? null) : null;
}

/**
 * What's wrong with the placeholders in `text`, or null when it uses only
 * `allowed` ones. `former` names are accepted too, so text saved before a
 * placeholder was renamed still works, but they're never suggested.
 */
export function placeholderProblem(text: string, allowed: readonly string[], former: readonly string[] = []): string | null {
  const unknown = placeholdersIn(text).filter((name) => !allowed.includes(name) && !former.includes(name));
  if (unknown.length === 0) return null;
  const used = unknown.map((name) => `{${name}}`).join(", ");
  if (allowed.length === 0) return `Remove ${used}: this text can't fill in details.`;
  return `Remove ${used}. This text can use ${listOf(allowed.map((name) => `{${name}}`))}.`;
}

function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
