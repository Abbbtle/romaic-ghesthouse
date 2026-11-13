import { useSyncExternalStore } from "react";
import type { StoredValue } from "./stored-value";

const serverSnapshot = () => null;

/**
 * A value kept in this browser (see stored-value.ts), drawn again whenever
 * it changes in this tab or another. Null on the server and while the page
 * hydrates, which can't see the browser's storage, so both draw the same.
 */
export function useStoredValue<T>(stored: StoredValue<T>): T | null {
  return useSyncExternalStore(stored.subscribe, stored.read, serverSnapshot);
}
