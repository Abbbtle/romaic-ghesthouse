/**
 * One value kept in this browser's localStorage, for conveniences that
 * belong to one phone, such as a dismissed notice. Storage can
 * come back empty or refuse any access (a private window, blocked site
 * data), so every access is wrapped and the page works without it: a value
 * that can't be read is the codec's empty one, and one the browser won't
 * store is kept for this page instead.
 *
 * It's shaped for useSyncExternalStore (see use-stored-value.ts): read()
 * returns the same object until the stored text changes, so React doesn't
 * draw again for nothing, and listeners hear of every change, this tab's
 * own included, which the 'storage' event only reports to other tabs.
 */

/** How the value is written down: parse must cope with anything, a missing value (null) and someone else's text included. */
export type StoredValueCodec<T> = {
  parse(raw: string | null): T;
  serialise(value: T): string;
};

/** Where values are kept, and how other tabs say they changed: in a browser, localStorage and its 'storage' event. */
export type StorageHost = {
  /** The storage itself; it may throw when the browser blocks it. */
  storage(): Pick<Storage, "getItem" | "setItem">;
  /** Calls `listener` with the key another tab changed, or null when it cleared them all; returns what stops listening. */
  watchOtherTabs(listener: (key: string | null) => void): () => void;
};

export type StoredValue<T> = {
  /** Listens for changes in this tab and others; returns what stops listening. */
  subscribe(listener: () => void): () => void;
  /** The value now: the same object until the stored text changes. */
  read(): T;
  /** Changes the value, from what's stored now, and tells every listener. */
  update(change: (current: T) => T): void;
};

/** localStorage and the 'storage' event other tabs fire. Touched only when called, so it's safe to import on the server. */
export const browserStorage: StorageHost = {
  storage: () => window.localStorage,
  watchOtherTabs(listener) {
    const onStorage = (event: StorageEvent) => listener(event.key);
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  },
};

export function storedValue<T>(key: string, codec: StoredValueCodec<T>, host: StorageHost = browserStorage): StoredValue<T> {
  const listeners = new Set<() => void>();
  let stopWatching: (() => void) | null = null;
  /** What was last written when the browser refused to store it: this page reads it from here instead. */
  let unsaved: { raw: string } | null = null;
  let cached: { raw: string | null; value: T } | null = null;

  function storedText(): string | null {
    if (unsaved) return unsaved.raw;
    try {
      return host.storage().getItem(key);
    } catch {
      return null;
    }
  }

  function store(raw: string): void {
    try {
      host.storage().setItem(key, raw);
      unsaved = null;
    } catch {
      unsaved = { raw };
    }
  }

  function notify(): void {
    for (const listener of [...listeners]) listener();
  }

  function read(): T {
    const raw = storedText();
    if (cached === null || cached.raw !== raw) cached = { raw, value: codec.parse(raw) };
    return cached.value;
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      stopWatching ??= host.watchOtherTabs((changed) => {
        if (changed === null || changed === key) notify();
      });
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        stopWatching?.();
        stopWatching = null;
      };
    },
    read,
    update(change) {
      store(codec.serialise(change(read())));
      notify();
    },
  };
}
