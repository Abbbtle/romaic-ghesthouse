/**
 * How to scroll something into view: smoothly, unless the person asked for
 * less motion (design-spec §12). Browser-only: call it from effects and
 * event handlers.
 */
export function preferredScrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
