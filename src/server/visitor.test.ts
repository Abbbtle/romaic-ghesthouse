import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clientAddress, rateLimitAddress } from "./visitor";

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

describe("the address a rate limit counts", () => {
  it("keeps IPv4, groups IPv6 by its /64, and reads IPv4 written as IPv6", () => {
    assert.equal(rateLimitAddress("203.0.113.9"), "203.0.113.9");
    assert.equal(rateLimitAddress("2001:db8:1234:5678:aaaa:bbbb:cccc:dddd"), "2001:db8:1234:5678::/64");
    assert.equal(rateLimitAddress("2001:db8:1234:5678::1"), "2001:db8:1234:5678::/64");
    assert.equal(rateLimitAddress("2001:0db8:0000:0001:ffff::9"), "2001:db8:0:1::/64");
    assert.equal(rateLimitAddress("[2001:db8::1]"), "2001:db8:0:0::/64");
    assert.equal(rateLimitAddress("::ffff:198.51.100.7"), "198.51.100.7");
    assert.equal(rateLimitAddress(null), null);
    assert.equal(rateLimitAddress("not:an:address:zz"), "not:an:address:zz");
  });
});
