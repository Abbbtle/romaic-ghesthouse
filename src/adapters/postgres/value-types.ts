/**
 * How column values read, whichever driver ran the statement. node-postgres
 * and PGlite each have their own idea of some types: node-postgres turns a
 * date into a Date at local midnight (which shifts days), PGlite reads a
 * timestamp without time zone in the host's zone, and int8 comes back as a
 * string or a BigInt. Both drivers use these parsers instead, so every store
 * gets the same values everywhere:
 *
 * - date → "2026-10-20" and time → "06:30:00": calendar values stay strings
 *   (the cores use "HH:MM"; stores convert at their boundary)
 * - timestamptz → Date, from the offset Postgres prints, so the session's
 *   time zone never matters
 * - timestamp (without time zone) → Date, read as UTC
 * - int8 and numeric → number (counters and whole rands fit well below 2^53)
 * - json and jsonb → the parsed value
 * - bytea → Uint8Array (a plain one, never a Node Buffer)
 *
 * Arrays of these types read as arrays of the same values. Everything else
 * (text, int4, uuid, boolean, text[] …) reads the same on both drivers
 * already.
 *
 * Text forms are Postgres's defaults (DateStyle ISO, bytea_output hex), which
 * Supabase, PGlite and a stock Postgres all use. Reads don't depend on the
 * session's time zone either: each driver sets UTC (sessionTimeZone in
 * ./driver.ts), but Supabase's transaction pooler may hand a statement a
 * server connection that never saw that setting, so instants are read from
 * the offset Postgres prints rather than assumed to be UTC.
 */

/** Turns the text Postgres sends for one value into a JavaScript value. */
export type TypeParser = (text: string) => unknown;

/** Postgres type OIDs (pg_type.oid), fixed across versions. */
export const typeOids = {
  bytea: 17,
  int8: 20,
  json: 114,
  jsonArray: 199,
  byteaArray: 1001,
  int8Array: 1016,
  date: 1082,
  time: 1083,
  timestamp: 1114,
  timestampArray: 1115,
  dateArray: 1182,
  timeArray: 1183,
  timestamptz: 1184,
  timestamptzArray: 1185,
  numericArray: 1231,
  numeric: 1700,
  jsonb: 3802,
  jsonbArray: 3807,
} as const;

const asIs: TypeParser = (text) => text;

const asNumber: TypeParser = (text) => Number(text);

const asJson: TypeParser = (text) => JSON.parse(text) as unknown;

/** Parsers by type OID. A driver falls back to its own for any type not listed. */
export const typeParsers: Readonly<Record<number, TypeParser>> = {
  [typeOids.int8]: asNumber,
  [typeOids.numeric]: asNumber,
  [typeOids.date]: asIs,
  [typeOids.time]: asIs,
  [typeOids.timestamptz]: parseTimestamp,
  [typeOids.timestamp]: parseTimestamp,
  [typeOids.json]: asJson,
  [typeOids.jsonb]: asJson,
  [typeOids.bytea]: parseBytea,
  [typeOids.int8Array]: arrayOf(asNumber),
  [typeOids.numericArray]: arrayOf(asNumber),
  [typeOids.dateArray]: arrayOf(asIs),
  [typeOids.timeArray]: arrayOf(asIs),
  [typeOids.timestamptzArray]: arrayOf(parseTimestamp),
  [typeOids.timestampArray]: arrayOf(parseTimestamp),
  [typeOids.jsonArray]: arrayOf(asJson),
  [typeOids.jsonbArray]: arrayOf(asJson),
  [typeOids.byteaArray]: arrayOf(parseBytea),
};

// "2026-10-20 04:00:00.123456+02", with an offset for timestamptz (hours, and minutes or seconds
// for odd historical zones) and none for timestamp. Years before 1 AD end in " BC".
const timestampPattern =
  /^(\d{4,})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(?:([+-])(\d{2})(?::(\d{2}))?(?::(\d{2}))?)?( BC)?$/;

// The furthest instants a JavaScript Date can hold, for Postgres's 'infinity' and '-infinity'.
const latestDate = 8.64e15;

/**
 * An instant from a timestamptz (or a timestamp, taken as UTC). Built from
 * the numbers in the text rather than Date's own parser, which rejects some
 * forms Postgres prints, such as offsets with seconds.
 */
export function parseTimestamp(text: string): Date {
  if (text === "infinity") return new Date(latestDate);
  if (text === "-infinity") return new Date(-latestDate);
  const match = timestampPattern.exec(text);
  if (!match) throw new Error(`Postgres sent a timestamp in an unexpected form: "${text}". Is DateStyle ISO?`);
  const [, year, month, day, hour, minute, second, fraction, sign, offsetHours, offsetMinutes, offsetSeconds, bc] = match;
  const instant = new Date(0);
  // setUTCFullYear, unlike Date.UTC, keeps years 0–99 as they are.
  instant.setUTCFullYear(bc ? 1 - Number(year) : Number(year), Number(month) - 1, Number(day));
  instant.setUTCHours(Number(hour), Number(minute), Number(second), Number((fraction ?? "").padEnd(3, "0").slice(0, 3)));
  const offset = (Number(offsetHours ?? 0) * 3600 + Number(offsetMinutes ?? 0) * 60 + Number(offsetSeconds ?? 0)) * 1000;
  return new Date(instant.getTime() - (sign === "-" ? -offset : offset));
}

/** Bytes from bytea's hex form ("\x0102"), or its older escape form. */
export function parseBytea(text: string): Uint8Array {
  if (text.startsWith("\\x")) {
    const hex = text.slice(2);
    const bytes = new Uint8Array(hex.length / 2);
    for (let index = 0; index < bytes.length; index++) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    return bytes;
  }
  const bytes: number[] = [];
  for (let index = 0; index < text.length; ) {
    if (text[index] !== "\\") {
      bytes.push(text.charCodeAt(index));
      index += 1;
    } else if (text[index + 1] === "\\") {
      bytes.push(0x5c);
      index += 2;
    } else {
      bytes.push(Number.parseInt(text.slice(index + 1, index + 4), 8));
      index += 4;
    }
  }
  return Uint8Array.from(bytes);
}

/** A parser for a one-dimensional Postgres array whose elements each read with `element`. */
export function arrayOf(element: TypeParser): TypeParser {
  return (text) => parseArrayLiteral(text).map((value) => (value === null ? null : element(value)));
}

/**
 * The elements of an array literal such as {a,"b,c",NULL} as text, with null
 * for NULL. Arrays of arrays aren't used by the stores, so they aren't read.
 */
export function parseArrayLiteral(text: string): (string | null)[] {
  // An array with explicit bounds, such as [0:1]={a,b}, starts with its dimensions.
  const body = text.startsWith("[") ? text.slice(text.indexOf("=") + 1) : text;
  if (!body.startsWith("{") || !body.endsWith("}")) throw new Error("Postgres sent an array in an unexpected form.");
  const inner = body.slice(1, -1);
  const elements: (string | null)[] = [];
  if (inner === "") return elements;
  let index = 0;
  while (index <= inner.length) {
    if (inner[index] === "{") throw new Error("Arrays of arrays aren't supported here.");
    if (inner[index] === '"') {
      let value = "";
      index += 1;
      while (index < inner.length && inner[index] !== '"') {
        if (inner[index] === "\\") index += 1;
        value += inner[index] ?? "";
        index += 1;
      }
      elements.push(value);
      index += 2; // the closing quote and the comma after it
    } else {
      const end = inner.indexOf(",", index);
      const value = inner.slice(index, end === -1 ? inner.length : end);
      elements.push(value === "NULL" ? null : value);
      index = end === -1 ? inner.length + 1 : end + 1;
    }
  }
  return elements;
}
