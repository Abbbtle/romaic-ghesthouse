import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { storedValue, type StorageHost, type StoredValueCodec } from "./stored-value";

type Words = readonly string[];

/** Words written one per line; nothing stored means no words. */
const words: StoredValueCodec<Words> = {
  parse: (raw) => (raw ? raw.split("\n") : []),
  serialise: (value) => value.join("\n"),
};

/** A browser's storage for one test: what's stored, whether it lets the page in, and the 'storage' events of other tabs. */
function fakeBrowser() {
  const items = new Map<string, string>();
  const watchers = new Set<(key: string | null) => void>();
  const state = { blocked: false, full: false };
  const host: StorageHost = {
    storage() {
      if (state.blocked) throw new Error("SecurityError: the page may not use storage");
      return {
        getItem: (key) => items.get(key) ?? null,
        setItem: (key, value) => {
          if (state.full) throw new Error("QuotaExceededError");
          items.set(key, value);
        },
      };
    },
    watchOtherTabs(listener) {
      watchers.add(listener);
      return () => watchers.delete(listener);
    },
  };
  return {
    host,
    items,
    state,
    watchers,
    /** Another tab writes `value` under `key`. */
    otherTabWrites(key: string, value: string) {
      items.set(key, value);
      for (const watcher of watchers) watcher(key);
    },
  };
}

describe("a value kept in the browser", () => {
  it("reads the codec's empty value when nothing is stored", () => {
    const browser = fakeBrowser();
    assert.deepEqual(storedValue("list", words, browser.host).read(), []);
  });

  it("gives the same object until the stored text changes, as useSyncExternalStore needs", () => {
    const browser = fakeBrowser();
    const list = storedValue("list", words, browser.host);
    browser.items.set("list", "a\nb");
    const first = list.read();
    assert.deepEqual(first, ["a", "b"]);
    assert.equal(list.read(), first);
    browser.items.set("list", "a\nb\nc");
    const second = list.read();
    assert.deepEqual(second, ["a", "b", "c"]);
    assert.notEqual(second, first);
    assert.equal(list.read(), second);
  });

  it("writes a change made from what's stored now, and tells this tab's listeners, which the 'storage' event doesn't", () => {
    const browser = fakeBrowser();
    const list = storedValue("list", words, browser.host);
    let heard = 0;
    list.subscribe(() => heard++);
    browser.items.set("list", "a");
    list.update((current) => [...current, "b"]);
    assert.equal(browser.items.get("list"), "a\nb");
    assert.deepEqual(list.read(), ["a", "b"]);
    assert.equal(heard, 1);
  });

  it("hears another tab change its key or clear storage, but not other keys", () => {
    const browser = fakeBrowser();
    const list = storedValue("list", words, browser.host);
    let heard = 0;
    list.subscribe(() => heard++);
    browser.otherTabWrites("other", "x");
    assert.equal(heard, 0);
    browser.otherTabWrites("list", "z");
    assert.equal(heard, 1);
    assert.deepEqual(list.read(), ["z"]);
    for (const watcher of browser.watchers) watcher(null);
    assert.equal(heard, 2);
  });

  it("watches other tabs once while anyone listens, and stops after the last", () => {
    const browser = fakeBrowser();
    const list = storedValue("list", words, browser.host);
    const stopFirst = list.subscribe(() => {});
    const stopSecond = list.subscribe(() => {});
    assert.equal(browser.watchers.size, 1);
    stopFirst();
    assert.equal(browser.watchers.size, 1);
    stopSecond();
    assert.equal(browser.watchers.size, 0);
    list.subscribe(() => {});
    assert.equal(browser.watchers.size, 1);
  });

  it("works without storage: blocked reads give the empty value, and a write the browser refuses is kept for this page", () => {
    const blocked = fakeBrowser();
    blocked.state.blocked = true;
    const list = storedValue("list", words, blocked.host);
    assert.deepEqual(list.read(), []);
    list.update((current) => [...current, "a"]);
    assert.deepEqual(list.read(), ["a"]);

    const full = fakeBrowser();
    full.items.set("list", "old");
    full.state.full = true;
    const kept = storedValue("list", words, full.host);
    kept.update((current) => [...current, "new"]);
    assert.equal(full.items.get("list"), "old");
    assert.deepEqual(kept.read(), ["old", "new"]);
    full.state.full = false;
    kept.update((current) => [...current, "saved"]);
    assert.equal(full.items.get("list"), "old\nnew\nsaved", "once storing works again, the page's value is stored");
  });
});
