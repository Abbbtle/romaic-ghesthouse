import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseWith } from "@/lib/forms/parse";
import {
  addMemberInput,
  changePasswordInput,
  changeRoleInput,
  memberIdInput,
  passwordProblem,
  replaceTemporaryPasswordInput,
  setupInput,
  signInInput,
} from "./input";

/** A form as a browser sends it, server action bookkeeping included. */
function form(fields: Record<string, string>): Record<string, FormDataEntryValue> {
  const data = new FormData();
  data.set("$ACTION_ID_0123", "");
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return Object.fromEntries(data);
}

describe("signInInput", () => {
  it("reads the address in lower case and the password exactly as typed", () => {
    assert.deepEqual(parseWith(signInInput, form({ email: "  Lerato@Example.COM ", password: " spaced out " })), {
      ok: true,
      value: { email: "lerato@example.com", password: " spaced out " },
    });
  });

  it("asks for what's missing, in plain words", () => {
    assert.deepEqual(parseWith(signInInput, form({})), {
      ok: false,
      errors: { email: "Enter your email address.", password: "Enter your password." },
    });
    assert.deepEqual(parseWith(signInInput, form({ email: "lerato", password: "x" })), {
      ok: false,
      errors: { email: "Enter an email address like name@example.com." },
    });
  });
});

describe("setupInput", () => {
  const owner = { name: " Lerato   Mokoena ", email: "lerato@example.com", password: "a long passphrase", confirmPassword: "a long passphrase" };

  it("reads the first owner's details, the setup code being optional", () => {
    assert.deepEqual(parseWith(setupInput, form(owner)), {
      ok: true,
      value: { name: "Lerato Mokoena", email: "lerato@example.com", password: "a long passphrase", confirmPassword: "a long passphrase", setupToken: "" },
    });
    const withCode = parseWith(setupInput, form({ ...owner, setupToken: " code-from-the-server " }));
    assert.equal(withCode.ok && withCode.value.setupToken, "code-from-the-server");
  });

  it("wants a long enough password, typed the same twice, that isn't the email address", () => {
    assert.deepEqual(parseWith(setupInput, form({ ...owner, password: "short", confirmPassword: "short" })).ok, false);
    assert.deepEqual(parseWith(setupInput, form({ ...owner, confirmPassword: "a long passphrasE" })), {
      ok: false,
      errors: { confirmPassword: "The passwords don't match." },
    });
    assert.deepEqual(parseWith(setupInput, form({ ...owner, password: "Lerato@Example.com", confirmPassword: "Lerato@Example.com" })), {
      ok: false,
      errors: { password: "Don't use your email address as your password." },
    });
  });

  it("says the passwords don't match even while another field has a problem", () => {
    const result = parseWith(setupInput, form({ ...owner, name: "", confirmPassword: "different" }));
    assert.deepEqual(result, { ok: false, errors: { name: "Enter your name.", confirmPassword: "The passwords don't match." } });
  });
});

describe("addMemberInput and changeRoleInput", () => {
  it("reads a new member's name, address and role", () => {
    assert.deepEqual(parseWith(addMemberInput, form({ name: "Sam", email: "Sam@Example.com", role: "admin" })), {
      ok: true,
      value: { name: "Sam", email: "sam@example.com", role: "admin" },
    });
    assert.deepEqual(parseWith(addMemberInput, form({ name: "", email: "", role: "manager" })), {
      ok: false,
      errors: { name: "Enter their name.", email: "Enter their email address.", role: "Choose a role." },
    });
    assert.deepEqual(parseWith(changeRoleInput, form({ role: "owner" })), { ok: true, value: { role: "owner" } });
  });

  it("keeps names to one line and a sensible length", () => {
    const long = parseWith(addMemberInput, form({ name: "x".repeat(121), email: "sam@example.com", role: "admin" }));
    assert.deepEqual(long, { ok: false, errors: { name: "Keep it under 120 characters." } });
  });
});

describe("changePasswordInput and replaceTemporaryPasswordInput", () => {
  it("asks for the current password only when changing your own", () => {
    assert.deepEqual(parseWith(changePasswordInput, form({ newPassword: "another passphrase", confirmPassword: "another passphrase" })), {
      ok: false,
      errors: { currentPassword: "Enter your current password." },
    });
    assert.deepEqual(parseWith(replaceTemporaryPasswordInput, form({ newPassword: "another passphrase", confirmPassword: "another passphrase" })), {
      ok: true,
      value: { newPassword: "another passphrase", confirmPassword: "another passphrase" },
    });
  });

  it("checks the new password's length and its confirmation", () => {
    assert.deepEqual(parseWith(replaceTemporaryPasswordInput, form({ newPassword: "short", confirmPassword: "short" })), {
      ok: false,
      errors: { newPassword: "Use at least 10 characters." },
    });
    assert.deepEqual(parseWith(changePasswordInput, form({ currentPassword: "old one", newPassword: "another passphrase", confirmPassword: "x" })), {
      ok: false,
      errors: { confirmPassword: "The passwords don't match." },
    });
  });
});

describe("memberIdInput", () => {
  it("accepts only a member id shaped like one", () => {
    assert.equal(parseWith(memberIdInput, "00000000-0000-4000-8000-000000000001").ok, true);
    assert.equal(parseWith(memberIdInput, "1; drop table app.accounts").ok, false);
    assert.equal(parseWith(memberIdInput, { id: 1 }).ok, false);
  });
});

describe("passwordProblem", () => {
  it("explains what's wrong with a new password, or returns null", () => {
    assert.equal(passwordProblem("a long passphrase", "sam@example.com"), null);
    assert.equal(passwordProblem("short", "sam@example.com"), "Use at least 10 characters.");
    assert.equal(passwordProblem("x".repeat(201), "sam@example.com"), "Keep it under 200 characters.");
    assert.equal(passwordProblem(" SAM@example.com", "sam@example.com"), "Don't use your email address as your password.");
  });
});
