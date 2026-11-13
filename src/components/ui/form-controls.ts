import { cx } from "./cx";

/**
 * Field sizes (design-spec §11.1): comfortable controls are 48 px tall, for the
 * public booking form; compact ones 44 px, for the dashboard. Text is 16 px
 * either way, which stops iOS zooming in on focus.
 */
export type FieldDensity = "comfortable" | "compact";

const heights: Record<FieldDensity, string> = { comfortable: "h-12", compact: "h-11" };

// Rest: control border (3.95:1). Hover darkens it, focus turns it the focus
// colour with the global focus ring, and an invalid field keeps its red border whatever
// else is going on. Read-only fields sit on chalk: matched by the readonly
// attribute, since every <select> counts as :read-only. Scroll margins keep a
// focused field clear of the sticky header, save bar and tab bar.
const control =
  "block w-full min-w-0 rounded-sm border border-control bg-field px-3 text-base text-fg transition-colors duration-150 placeholder:text-fg-3 hover:border-control-hover focus:border-focus aria-invalid:border-danger aria-invalid:hover:border-danger-fg aria-invalid:focus:border-danger-fg [&[readonly]]:bg-chalk [&[readonly]]:hover:border-control disabled:bg-chalk disabled:text-fg-3 scroll-mt-24 scroll-mb-44";

export function inputClasses(density: FieldDensity, className?: string): string {
  return cx(control, heights[density], className);
}

export function textareaClasses(className?: string): string {
  return cx(control, "min-h-24 resize-y py-2.5 field-sizing-content", className);
}

export function selectClasses(density: FieldDensity, className?: string): string {
  return cx(control, heights[density], "select-chevron", className);
}

export const labelClasses = "text-sm font-semibold text-fg";
export const hintClasses = "text-sm text-fg-3";
export const errorClasses = "flex gap-1.5 text-sm text-danger-fg";
