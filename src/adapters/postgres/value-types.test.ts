import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseArrayLiteral, parseBytea, parseTimestamp, typeOids, typeParsers } from "./value-types";

describe("parseTimestamp", () => {
  it("reads the offset Postgres prints, whatever it is", () => {
    assert.equal(parseTimestamp("2026-10-20 04:00:00+00").toISOString(), "2026-10-20T04:00:00.000Z");
    assert.equal(parseTimestamp("2026-10-20 06:00:00.123456+02").toISOString(), "2026-10-20T04:00:00.123Z");
    assert.equal(parseTimestamp("2026-10-21 13:30:00+14").toISOString(), "2026-10-20T23:30:00.000Z");
    assert.equal(parseTimestamp("2026-10-20 00:00:00-03:30").toISOString(), "2026-10-20T03:30:00.000Z");
    // Historical local mean time, with seconds in the offset, which Date's own parser rejects.
    assert.equal(parseTimestamp("1890-01-01 00:00:00+01:52:08").toISOString(), "1889-12-31T22:07:52.000Z");
  });

  it("reads a timestamp without a time zone as UTC", () => {
    assert.equal(parseTimestamp("2026-10-20 06:30:00").toISOString(), "2026-10-20T06:30:00.000Z");
  });

  it("keeps early years and BC dates, and maps infinity to the furthest instants a Date holds", () => {
    assert.equal(parseTimestamp("0044-03-15 12:00:00+00").getUTCFullYear(), 44);
    assert.equal(parseTimestamp("0044-03-15 12:00:00+00 BC").getUTCFullYear(), -43);
    assert.equal(parseTimestamp("infinity").getTime(), 8.64e15);
    assert.equal(parseTimestamp("-infinity").getTime(), -8.64e15);
  });

  it("refuses text in another DateStyle rather than guessing", () => {
    assert.throws(() => parseTimestamp("10/20/2026 04:00:00 UTC"), /DateStyle/);
  });
});

describe("parseBytea", () => {
  it("reads the hex and escape forms into a plain Uint8Array", () => {
    const hex = parseBytea("\\x00ff10");
    assert.deepEqual(hex, Uint8Array.from([0, 255, 16]));
    assert.equal(Object.getPrototypeOf(hex), Uint8Array.prototype);
    assert.deepEqual(parseBytea("a\\\\b\\000\\377"), Uint8Array.from([0x61, 0x5c, 0x62, 0, 255]));
  });
});

describe("parseArrayLiteral", () => {
  it("splits elements, unquoting and unescaping, with null for NULL", () => {
    assert.deepEqual(parseArrayLiteral('{a,"b,c",NULL,"NULL","d\\"e","f\\\\g",""}'), ["a", "b,c", null, "NULL", 'd"e', "f\\g", ""]);
    assert.deepEqual(parseArrayLiteral("{}"), []);
    assert.deepEqual(parseArrayLiteral("[0:1]={x,y}"), ["x", "y"]);
  });

  it("parses each element of an array type with its element's parser", () => {
    const dates = typeParsers[typeOids.dateArray];
    const instants = typeParsers[typeOids.timestamptzArray];
    assert.deepEqual(dates?.("{2026-10-20,NULL}"), ["2026-10-20", null]);
    assert.deepEqual(instants?.('{"2026-10-20 04:00:00+00"}'), [new Date("2026-10-20T04:00:00Z")]);
  });
});
