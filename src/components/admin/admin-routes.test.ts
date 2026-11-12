import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isFinancePermission, permissions } from "@/lib/accounts/access";
import { roles } from "@/lib/kernel/actor";
import { adminNavFor, adminNavigation, adminSections, badgeText, homeFor, isCurrentAdminPath } from "./admin-routes";

describe("the dashboard's navigation", () => {
  it("lists every section once, each with a permission from the catalogue", () => {
    assert.deepEqual(
      adminNavigation.map((item) => item.section),
      [...adminSections],
    );
    for (const item of adminNavigation) assert.ok((permissions as readonly string[]).includes(item.permission), item.section);
  });

  it("shows each role only the sections its permissions open", () => {
    assert.deepEqual(
      adminNavFor("owner").map((item) => item.section),
      ["today", "bookings", "requests", "tasks", "content", "calendar", "guests", "rates", "channels", "apartments", "books", "tax", "team", "audit"],
    );
    assert.deepEqual(
      adminNavFor("admin").map((item) => item.section),
      ["content", "channels", "team", "audit"],
    );
    assert.deepEqual(
      adminNavFor("sales").map((item) => item.section),
      ["today", "bookings", "requests", "tasks", "calendar", "guests", "rates", "channels", "apartments"],
    );
    assert.deepEqual(
      adminNavFor("staff").map((item) => item.section),
      ["today", "tasks"],
    );
  });

  it("never shows admin a section behind a finance permission", () => {
    for (const item of adminNavFor("admin")) assert.equal(isFinancePermission(item.permission), false, item.section);
  });

  it("sends each role home to a section it may use", () => {
    assert.equal(homeFor("owner"), "/admin");
    assert.equal(homeFor("admin"), "/admin/content");
    for (const role of roles) assert.ok(adminNavFor(role).some((item) => item.href === homeFor(role)) || homeFor(role) === "/admin/account");
  });

  it("marks the current section, with Today matching only itself", () => {
    assert.equal(isCurrentAdminPath("/admin", "/admin"), true);
    assert.equal(isCurrentAdminPath("/admin", "/admin/team"), false);
    assert.equal(isCurrentAdminPath("/admin/content", "/admin/content/site"), true);
    assert.equal(isCurrentAdminPath("/admin/content", null), false);
  });

  it("caps badge counts at 99+", () => {
    assert.equal(badgeText(3), "3");
    assert.equal(badgeText(120), "99+");
  });
});
