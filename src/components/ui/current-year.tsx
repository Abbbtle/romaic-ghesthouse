"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * The current year, read only in the browser. Next.js forbids reading the
 * clock while it prerenders a page, so the server's answer is empty and the
 * year fills in as the page hydrates.
 */
export function CurrentYear() {
  const year = useSyncExternalStore(
    subscribe,
    () => new Date().getFullYear(),
    () => null,
  );
  return <>{year}</>;
}
