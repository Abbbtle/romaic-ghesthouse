import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SignedIn } from "@/lib/accounts/account-service";
import { anySignedInRole, NotAllowedError } from "@/lib/accounts/access";
import type { Actor } from "@/lib/kernel/actor";
import { createDashboardActionGuards, stepUpMessage } from "./admin-action-guards";

const owner: Actor = { id: "00000000-0000-4000-8000-000000000001", role: "owner", name: "Nico" };
const admin: Actor = { id: "00000000-0000-4000-8000-000000000002", role: "admin", name: "Weberu" };

function signedIn(actor: Actor, overrides: Partial<SignedIn> = {}): SignedIn {
  return {
    actor,
    email: "someone@example.com",
    mfaDue: false,
    mustChangePassword: false,
    mfaEnrolmentDue: false,
    stepUpAt: null,
    mfaEnabled: true,
    emailVerified: true,
    sessionHandle: "0000000000000000",
    ...overrides,
  };
}

function guards(current: SignedIn | null, reports: unknown[] = []) {
  return createDashboardActionGuards({
    currentSignIn: async () => current,
    clock: { now: () => new Date() },
    rethrowControlFlow: (error) => {
      if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    },
    reportError: (_description, error) => reports.push(error),
  });
}

describe("dashboard form actions", () => {
  it("runs the handler for someone allowed, with their actor", async () => {
    const action = guards(signedIn(owner)).dashboardFormAction(async (actor) => ({ status: "saved", message: actor.name }), { permission: "content:edit" });
    assert.deepEqual(await action({ status: "idle" }, new FormData()), { status: "saved", message: "Nico" });
  });

  it("refuses someone signed out, partway through signing in, or without the permission, keeping what they typed", async () => {
    const handler = async () => ({ status: "saved" as const, message: "ran" });
    assert.equal((await guards(null).dashboardFormAction(handler, anySignedInRole)({ status: "idle" }, new FormData())).status, "failed");
    assert.match(JSON.stringify(await guards(signedIn(owner, { mfaDue: true })).dashboardFormAction(handler, anySignedInRole)({ status: "idle" }, new FormData())), /authenticator/);
    assert.match(JSON.stringify(await guards(signedIn(owner, { mustChangePassword: true })).dashboardFormAction(handler, anySignedInRole)({ status: "idle" }, new FormData())), /own password/);
    assert.match(JSON.stringify(await guards(signedIn(admin)).dashboardFormAction(handler, { permission: "tax:manage" })({ status: "idle" }, new FormData())), /Only the owner/);
  });

  it("asks for the password and code again when a change needs it", async () => {
    const action = guards(signedIn(owner)).dashboardFormAction(async () => ({ status: "saved", message: "ran" }), { permission: "team:manage-all", stepUp: true });
    assert.deepEqual(await action({ status: "idle" }, new FormData()), { status: "failed", message: stepUpMessage });
    const recent = guards(signedIn(owner, { stepUpAt: new Date() })).dashboardFormAction(async () => ({ status: "saved", message: "ran" }), { ...anySignedInRole, stepUp: true });
    assert.equal((await recent({ status: "idle" }, new FormData())).status, "saved");
  });

  it("turns a service's refusal and an unexpected failure into messages, logging only the unexpected one", async () => {
    const reports: unknown[] = [];
    const refused = guards(signedIn(admin), reports).dashboardFormAction(async () => {
      throw new NotAllowedError("ledger:view");
    }, anySignedInRole);
    assert.match(JSON.stringify(await refused({ status: "idle" }, new FormData())), /Only the owner/);
    const broken = guards(signedIn(owner), reports).dashboardFormAction(async () => {
      throw new Error("database unreachable");
    }, anySignedInRole);
    assert.match(JSON.stringify(await broken({ status: "idle" }, new FormData())), /nothing was saved/);
    assert.equal(reports.length, 1);
  });

  it("lets Next.js's redirects through", async () => {
    const action = guards(signedIn(owner)).dashboardFormAction(async () => {
      throw new Error("NEXT_REDIRECT");
    }, anySignedInRole);
    await assert.rejects(action({ status: "idle" }, new FormData()), /NEXT_REDIRECT/);
  });
});

describe("dashboard actions with arguments", () => {
  it("answers signed-out, step-up or failed instead of running", async () => {
    const handler = async (_actor: Actor, id: unknown) => ({ status: "done" as const, id });
    assert.deepEqual(await guards(null).dashboardAction(handler, anySignedInRole)("x"), { status: "signed-out" });
    assert.deepEqual(await guards(signedIn(owner)).dashboardAction(handler, { ...anySignedInRole, stepUp: true })("x"), { status: "step-up" });
    assert.equal((await guards(signedIn(admin)).dashboardAction(handler, { permission: "settings:payments" })("x")).status, "failed");
    assert.deepEqual(await guards(signedIn(owner, { stepUpAt: new Date() })).dashboardAction(handler, { ...anySignedInRole, stepUp: true })("x"), { status: "done", id: "x" });
  });
});

describe("own-account form actions", () => {
  it("are open at any step of signing in, but not signed out", async () => {
    const action = guards(signedIn(owner, { mustChangePassword: true, mfaEnrolmentDue: true })).signedInFormAction(async () => ({ status: "saved", message: "ran" }));
    assert.equal((await action({ status: "idle" }, new FormData())).status, "saved");
    assert.equal((await guards(null).signedInFormAction(async () => ({ status: "saved", message: "ran" }))({ status: "idle" }, new FormData())).status, "failed");
  });
});
