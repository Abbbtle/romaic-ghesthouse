import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { signInInput } from "@/lib/accounts/input";
import { formValidator } from "./form-validator";

describe("formValidator", () => {
  const validate = formValidator(signInInput);

  it("reads a form's fields with the schema, problems keyed by field name", () => {
    const form = new FormData();
    form.append("email", "not an address");
    assert.deepEqual(validate(form), { email: "Enter an email address like name@example.com.", password: "Enter your password." });
  });

  it("finds nothing wrong with fields the schema accepts, whatever else the form holds", () => {
    const form = new FormData();
    form.append("email", "owner@romaic.test");
    form.append("password", "train-with-purpose-2026");
    form.append("next", "/admin/content");
    assert.deepEqual(validate(form), {});
  });
});
