import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { parseWith } from "./parse";
import { formStateOf, invalidState } from "./form-state";
import { done, refused, refusedWith } from "@/lib/kernel/result";

describe("parseWith", () => {
  const plan = z.object({
    name: z.string().trim().min(1, "Give the plan a name."),
    plans: z.array(z.object({ price: z.number().int().min(0, "Prices can't be negative.") })),
  });

  it("returns the typed value", () => {
    assert.deepEqual(parseWith(plan, { name: " Foundation ", plans: [{ price: 4400 }] }), {
      ok: true,
      value: { name: "Foundation", plans: [{ price: 4400 }] },
    });
  });

  it("keys problems by dotted path, first message per field", () => {
    const result = parseWith(plan, { name: "", plans: [{ price: 1 }, { price: -5 }] });
    assert.deepEqual(result, { ok: false, errors: { name: "Give the plan a name.", "plans.1.price": "Prices can't be negative." } });
  });

  it("puts problems with the whole value under 'form'", () => {
    const result = parseWith(plan, "not an object");
    assert.equal(result.ok, false);
    assert.ok(!result.ok && "form" in result.errors);
  });
});

describe("form state", () => {
  it("reads a service result", () => {
    assert.deepEqual(formStateOf(done(), "Saved."), { status: "saved", message: "Saved." });
    assert.deepEqual(formStateOf(refused({ name: "Required" })), { status: "invalid", errors: { name: "Required" } });
  });

  it("shows a whole-form problem as a failure", () => {
    assert.deepEqual(formStateOf(refusedWith("That session no longer exists.")), {
      status: "failed",
      message: "That session no longer exists.",
    });
    assert.deepEqual(invalidState({ form: "Check the dates.", start: "Required" }), {
      status: "invalid",
      errors: { form: "Check the dates.", start: "Required" },
    });
  });
});
