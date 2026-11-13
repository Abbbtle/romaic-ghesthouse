"use client";

import { useCallback, useSyncExternalStore } from "react";
import { BookingDock, type DockAction } from "./booking-dock";

function subscribe(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  window.addEventListener("resize", onChange, { passive: true });
  return () => {
    window.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
  };
}

/**
 * The phone booking dock, shown only once the element with id `afterId` (the
 * hero's own booking buttons) has scrolled up out of view, so the first
 * phone screen never offers the same two actions twice. It slides up when
 * the visitor scrolls past, and simply appears under reduced motion. Before
 * scripts run it stays hidden: the hero buttons and the contact bar carry
 * the booking details meanwhile.
 *
 * It reads the element's position on scroll rather than using an
 * IntersectionObserver, which never fires when a fast fling jumps straight
 * past the element.
 */
export function DockReveal({ afterId, primary, secondary }: { afterId: string; primary: DockAction; secondary: DockAction }) {
  const scrolledPast = useCallback(() => {
    const target = document.getElementById(afterId);
    return target ? target.getBoundingClientRect().bottom < 0 : true;
  }, [afterId]);
  const shown = useSyncExternalStore(subscribe, scrolledPast, () => false);
  return <BookingDock primary={primary} secondary={secondary} hidden={!shown} />;
}
