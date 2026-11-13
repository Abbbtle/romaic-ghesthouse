import { useSyncExternalStore } from "react";

function subscribe(onScroll: () => void) {
  window.addEventListener("scroll", onScroll, { passive: true });
  return () => window.removeEventListener("scroll", onScroll);
}

/**
 * Whether the page has scrolled more than `offset` pixels, e.g. to give the
 * sticky header its shadow. False on the server and before hydration.
 */
export function useScrolledPast(offset: number): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.scrollY > offset,
    () => false,
  );
}
