import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fillPlaceholders, placeholderAt, placeholderProblem, placeholdersIn, placeholderValue } from "./placeholders";

describe("placeholders", () => {
  it("lists the ones a text uses, once each", () => {
    assert.deepEqual(placeholdersIn("{businessName} ({location}, {email}) — {businessName}"), ["businessName", "location", "email"]);
    assert.deepEqual(placeholdersIn("Braces { like this } and {1st} aren't placeholders"), []);
  });

  it("fills in those with a value and leaves the rest", () => {
    assert.equal(fillPlaceholders("Booked for the next {horizon}. {unknown}", { horizon: "4 weeks" }), "Booked for the next 4 weeks. {unknown}");
    assert.equal(fillPlaceholders("{toString}", {}), "{toString}");
  });

  it("reads the placeholder at a position, for parsers that read as they go", () => {
    assert.deepEqual(placeholderAt("Email {email} now", 6), { name: "email", end: 13 });
    assert.equal(placeholderAt("Email {email} now", 5), null);
    assert.equal(placeholderAt("{1st} { spaced }", 0), null);
    assert.equal(placeholderAt("{open", 0), null);
  });

  it("finds a value only for names that were given one", () => {
    assert.equal(placeholderValue("email", { email: "a@b.co" }), "a@b.co");
    assert.equal(placeholderValue("phone", { email: "a@b.co" }), null);
    assert.equal(placeholderValue("toString", {}), null);
    assert.equal(placeholderValue("__proto__", {}), null);
  });

  it("explains placeholders a text may not use", () => {
    const allowed = ["businessName", "location", "email", "phone"];
    assert.equal(placeholderProblem("{businessName} at {location}", allowed), null);
    assert.equal(
      placeholderProblem("{trainer} and {surname}", allowed),
      "Remove {trainer}, {surname}. This text can use {businessName}, {location}, {email} and {phone}.",
    );
    assert.equal(placeholderProblem("Next {horizon}", ["horizon"]), null);
    assert.equal(placeholderProblem("Next {horizon}", []), "Remove {horizon}: this text can't fill in details.");
  });
});
