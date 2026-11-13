import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bind, jsonParam } from "./database";
import { ExclusionViolationError, typedDatabaseError, UniqueViolationError } from "./errors";
import { checkMigrationOrder } from "./migrate";
import { migrations } from "./migrations/registry";

describe("bind", () => {
  it("numbers named parameters, reusing a number for a repeated name", () => {
    assert.deepEqual(bind("select :a, :b, :a", { a: 1, b: "two" }), { text: "select $1, $2, $1", values: [1, "two"] });
  });

  it("leaves casts, times and JSON paths alone", () => {
    const { text } = bind("select :value::jsonb, '10:30', settings #>> '{a,b}' from t where x = :x", { value: jsonParam({}), x: 1 });
    assert.equal(text, "select $1::jsonb, '10:30', settings #>> '{a,b}' from t where x = $2");
  });

  it("refuses a statement with a parameter nobody gave", () => {
    assert.throws(() => bind("select :missing", {}), /:missing/);
  });

  it("sends instants as UTC ISO text, JSON as text and replaces U+0000 in text", () => {
    const { values } = bind("select :at, :data, :text, :words, :bytes", {
      at: new Date("2026-10-20T04:30:00+02:00"),
      data: jsonParam({ a: "x\u0000" }),
      text: "a\u0000b",
      words: ["p\u0000"],
      bytes: Uint8Array.from([0]),
    });
    assert.deepEqual(values, ["2026-10-20T02:30:00.000Z", '{"a":"x�"}', "a�b", ["p�"], Uint8Array.from([0])]);
  });

  it("refuses an invalid Date rather than storing nonsense", () => {
    assert.throws(() => bind("select :at", { at: new Date("not a date") }), /invalid Date/);
  });
});

describe("jsonParam", () => {
  it("makes strings and keys storable in jsonb, at any depth", () => {
    const { values } = bind("select :data", {
      data: jsonParam({ "k\u0000": ["v\ud800", 1, null, { n: "\u0000" }], at: new Date("2026-10-19T00:00:00Z") }),
    });
    assert.deepEqual(JSON.parse(String(values[0])), { "k�": ["v�", 1, null, { n: "�" }], at: "2026-10-19T00:00:00.000Z" });
  });

  it("recognises a JSON parameter made by another copy of this module, as Next's dev server bundles one per route", () => {
    // What jsonParam in a different bundle of database.ts produces: the same registered symbol, its own object.
    const fromAnotherCopy = { [Symbol.for("romaic.database.jsonText")]: '{"from":"elsewhere"}' } as unknown as ReturnType<typeof jsonParam>;
    assert.deepEqual(bind("select :data", { data: fromAnotherCopy }).values, ['{"from":"elsewhere"}']);
  });

  it("binds as JSON text, never mistaken for a plain string or bytes", () => {
    const { values } = bind("select :data, :text, :bytes", {
      data: jsonParam(["a"]),
      text: '["a"]',
      bytes: Uint8Array.from([1]),
    });
    assert.deepEqual(values, ['["a"]', '["a"]', Uint8Array.from([1])]);
    assert.deepEqual(bind("select :data", { data: jsonParam(undefined) }).values, ["null"], "undefined, which JSON can't hold, is null");
  });
});

describe("typedDatabaseError", () => {
  it("names the constraint behind a unique or exclusion violation, and passes anything else through", () => {
    const unique = typedDatabaseError({ code: "23505", constraint: "accounts_email_unique", table: "accounts", detail: "Key (email)=(a@b.co)" });
    assert.ok(unique instanceof UniqueViolationError);
    assert.equal(unique.constraint, "accounts_email_unique");
    assert.ok(!("detail" in unique), "the clashing value isn't kept");

    const overlap = typedDatabaseError({ code: "23P01", constraint: "diary_entries_no_overlap", table: "diary_entries" });
    assert.ok(overlap instanceof ExclusionViolationError);
    assert.equal(overlap.code, "23P01");

    const other = new Error("connection reset");
    assert.equal(typedDatabaseError(other), other);
    assert.equal(typedDatabaseError("text"), "text");
  });

  it("passes an error that's already typed through as it is, as one does from a statement through its transaction", () => {
    const typed = new UniqueViolationError("accounts_email_unique", "accounts");
    assert.equal(typedDatabaseError(typed), typed);
  });
});

describe("checkMigrationOrder", () => {
  it("accepts the registry", () => {
    assert.doesNotThrow(() => checkMigrationOrder(migrations));
  });

  it("refuses ids that are malformed, repeated or out of order", () => {
    assert.throws(() => checkMigrationOrder([{ id: "accounts", sql: "" }]), /should look like/);
    assert.throws(
      () =>
        checkMigrationOrder([
          { id: "010-accounts", sql: "" },
          { id: "010-accounts", sql: "" },
        ]),
      /must come after/,
    );
    assert.throws(
      () =>
        checkMigrationOrder([
          { id: "020-media", sql: "" },
          { id: "010-accounts", sql: "" },
        ]),
      /must come after/,
    );
  });
});
