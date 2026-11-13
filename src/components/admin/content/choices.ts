import type { FieldOption } from "@/components/ui/fields";
import { contentIconNames, contentIcons, socialPlatformNames, socialPlatforms } from "@/lib/content/schema";

/** The content core's value lists as select options, labelled with its names. */
function optionsOf<Value extends string>(values: readonly Value[], names: Record<Value, string>): FieldOption[] {
  return values.map((value) => ({ value, label: names[value] }));
}

export const contentIconOptions = optionsOf(contentIcons, contentIconNames);
export const socialPlatformOptions = optionsOf(socialPlatforms, socialPlatformNames);

const longestSlug = 48;

/**
 * A link name made from a name, as the content core accepts them: "Family
 * Room" → "family-room", "Élite Suite" → "elite-suite". Empty when nothing
 * in the name can be used.
 */
export function slugFrom(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, longestSlug)
    .replace(/^-+|-+$/g, "");
}

/** `wanted`, or with -2, -3… added until no `taken` link name has it. */
export function freeSlug(wanted: string, taken: readonly string[], fallback: string): string {
  const base = slugFrom(wanted) || fallback;
  if (!taken.includes(base)) return base;
  for (let suffix = 2; ; suffix++) {
    const candidate = `${base.slice(0, longestSlug - String(suffix).length - 1)}-${suffix}`;
    if (!taken.includes(candidate)) return candidate;
  }
}
