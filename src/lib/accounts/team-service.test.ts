import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Actor } from "@/lib/kernel/actor";
import { NotAllowedError } from "./access";
import { accountHarness } from "./testing/harness";

const actorOf = (account: { id: string; role: Actor["role"]; name: string }): Actor => ({ id: account.id, role: account.role, name: account.name });

describe("the team, as an owner", () => {
  it("adds anyone with a temporary password that expires after 72 hours", async () => {
    const h = accountHarness();
    const owner = actorOf(await h.addAccount("owner"));
    const added = await h.team.addMember(owner, { name: "Lerato", email: "lerato@example.com", role: "sales" });
    assert.ok(added.ok);
    assert.equal(added.expiresAt.getTime() - h.clock.now().getTime(), 72 * 60 * 60 * 1000);
    const stored = await h.stores.accounts.findById(added.memberId);
    assert.equal(stored?.mustChangePassword, true);
    assert.ok(h.audit.events.some((event) => event.action === "team.member-added" && event.category === "team"));
  });

  it("changes roles and signs the person out, but never leaves the team without an active owner", async () => {
    const h = accountHarness();
    const owner = actorOf(await h.addAccount("owner"));
    const sales = await h.addAccount("sales");
    const token = await h.signInFully(await h.addAccount("staff"));
    void token;
    assert.ok((await h.team.changeRole(owner, sales.id, { role: "staff" })).ok);
    const otherOwner = await h.addAccount("owner");
    assert.ok((await h.team.changeRole(owner, otherOwner.id, { role: "admin" })).ok);
    const solo = accountHarness();
    const lone = actorOf(await solo.addAccount("owner"));
    const second = await solo.addAccount("owner", { status: "disabled" });
    assert.equal((await solo.team.changeRole(lone, second.id, { role: "admin" })).ok, true, "a disabled owner can be demoted");
    assert.equal((await solo.team.setStatus(actorOf(second), lone.id, "disabled")).ok, false, "nobody acts with a demoted account's old power");
  });

  it("says the team must keep an owner only when that's why a change was refused", async () => {
    const h = accountHarness();
    const owner = actorOf(await h.addAccount("owner"));
    const other = await h.addAccount("owner", { status: "disabled" });
    // Removing the only active owner, by a (disabled) owner the service still trusts.
    assert.match(JSON.stringify(await h.team.removeMember(actorOf(other), owner.id)), /active owner/);
    // Someone else changed the account between the read and the write: the store says stale.
    const staff = await h.addAccount("staff");
    h.stores.accounts.setStatus = async () => "stale";
    const stale = await h.team.setStatus(owner, staff.id, "disabled");
    assert.equal(stale.ok, false);
    assert.doesNotMatch(JSON.stringify(stale), /active owner/);
    assert.match(JSON.stringify(stale), /changed the team/);
  });

  it("resets someone's authenticator and signs them out", async () => {
    const h = accountHarness();
    const owner = actorOf(await h.addAccount("owner"));
    const sales = await h.addAccount("sales");
    const token = await h.signInFully(sales);
    await h.enrol(token, sales.id);
    assert.ok((await h.team.resetMfa(owner, sales.id)).ok);
    assert.equal(await h.stores.mfa.find(sales.id), null);
  });

  it("never changes their own access", async () => {
    const h = accountHarness();
    const owner = await h.addAccount("owner");
    assert.equal((await h.team.removeMember(actorOf(owner), owner.id)).ok, false);
    assert.equal((await h.team.resetPassword(actorOf(owner), owner.id)).ok, false);
  });
});

describe("the team, as an admin (decision R1: staff only)", () => {
  it("adds, resets and turns off staff", async () => {
    const h = accountHarness();
    const admin = actorOf(await h.addAccount("admin"));
    const added = await h.team.addMember(admin, { name: "Thabo", email: "thabo@example.com", role: "staff" });
    assert.ok(added.ok);
    assert.ok((await h.team.resetPassword(admin, added.memberId)).ok);
    assert.ok((await h.team.setStatus(admin, added.memberId, "disabled")).ok);
  });

  for (const role of ["owner", "admin", "sales"] as const) {
    it(`can't add a ${role}`, async () => {
      const h = accountHarness();
      const admin = actorOf(await h.addAccount("admin"));
      await assert.rejects(h.team.addMember(admin, { name: "X", email: `x-${role}@example.com`, role }), NotAllowedError);
    });

    it(`can't reset, turn off or touch a ${role}'s account`, async () => {
      const h = accountHarness();
      const admin = actorOf(await h.addAccount("admin"));
      const member = await h.addAccount(role);
      await assert.rejects(h.team.resetPassword(admin, member.id), NotAllowedError);
      await assert.rejects(h.team.setStatus(admin, member.id, "disabled"), NotAllowedError);
    });
  }

  it("can't change roles, reset authenticators or remove anyone", async () => {
    const h = accountHarness();
    const admin = actorOf(await h.addAccount("admin"));
    const staff = await h.addAccount("staff");
    await assert.rejects(h.team.changeRole(admin, staff.id, { role: "sales" }), NotAllowedError);
    await assert.rejects(h.team.resetMfa(admin, staff.id), NotAllowedError);
    await assert.rejects(h.team.removeMember(admin, staff.id), NotAllowedError);
  });

  it("is offered only the staff role when adding someone", async () => {
    const h = accountHarness();
    const admin = actorOf(await h.addAccount("admin"));
    assert.deepEqual(h.team.rolesFor(admin), ["staff"]);
  });
});

describe("the team, as sales or staff", () => {
  for (const role of ["sales", "staff"] as const) {
    it(`gives ${role} no team powers at all`, async () => {
      const h = accountHarness();
      const member = actorOf(await h.addAccount(role));
      const staff = await h.addAccount("staff");
      await assert.rejects(h.team.list(member), NotAllowedError);
      await assert.rejects(h.team.addMember(member, { name: "X", email: "x@example.com", role: "staff" }), NotAllowedError);
      await assert.rejects(h.team.resetPassword(member, staff.id), NotAllowedError);
    });
  }
});
