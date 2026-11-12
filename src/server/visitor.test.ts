import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clientAddress } from "./visitor";

describe("clientAddress", () => {
  it("takes the last address in the header: the one the proxy closest to this server added", () => {
    assert.equal(clientAddress("203.0.113.7"), "203.0.113.7");
    assert.equal(clientAddress("198.51.100.1, 203.0.113.7"), "203.0.113.7", "a visitor can put anything first");
    assert.equal(clientAddress(" 2001:db8::1 ,, 2001:db8::2 "), "2001:db8::2");
  });

  it("has nothing when the header is missing or empty", () => {
    assert.equal(clientAddress(null), null);
    assert.equal(clientAddress(""), null);
    assert.equal(clientAddress(" , "), null);
  });
});
