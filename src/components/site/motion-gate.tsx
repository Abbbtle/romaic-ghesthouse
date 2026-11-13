"use client";

import { useEffect } from "react";

/**
 * Motion only after the visitor interacts, and never under reduced motion
 * (the performance and accessibility budget). On the first pointer, key or
 * scroll, it adds `is-animated` to <html>, which is the only switch the CSS
 * recipes (such as the gold bar's one sweep) listen for. No animation library
 * loads for this.
 */
export function MotionGate() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches) return;
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    const start = () => {
      document.documentElement.classList.add("is-animated");
      events.forEach((name) => window.removeEventListener(name, start));
    };
    events.forEach((name) => window.addEventListener(name, start, { once: true, passive: true }));
    return () => events.forEach((name) => window.removeEventListener(name, start));
  }, []);
  return null;
}
