import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { apartmentStatus, nightlyAvailability, publicAvailability } from "./availability";
import { nightsIn, staysOverlap, stayLabel, stayProblem } from "./stays";
import { inventoryHarness, testActor, TestNotAllowedError } from "./testing/harness";
import { testBlock, testUnit } from "./testing/store-contract";

const owner = testActor("owner");
const sales = testActor("sales");
const admin = testActor("admin");
const staff = testActor("staff");

describe("stays", () => {
  it("are half-open: leaving on the day another arrives doesn't clash", () => {
    assert.equal(staysOverlap({ arrive: "2026-12-10", leave: "2026-12-12" }, { arrive: "2026-12-12", leave: "2026-12-14" }), false);
    assert.equal(staysOverlap({ arrive: "2026-12-10", leave: "2026-12-13" }, { arrive: "2026-12-12", leave: "2026-12-14" }), true);
    assert.deepEqual(nightsIn({ arrive: "2026-12-30", leave: "2027-01-02" }), ["2026-12-30", "2026-12-31", "2027-01-01"]);
    assert.equal(stayLabel({ arrive: "2026-12-10", leave: "2026-12-12" }), "Thu 10 Dec to Sat 12 Dec 2026, 2 nights");
  });

  it("can be asked for from today, up to 30 nights and 18 months ahead", () => {
    const today = "2026-11-12";
    assert.equal(stayProblem({ arrive: "2026-11-12", leave: "2026-11-13" }, today), null);
    assert.deepEqual(stayProblem({ arrive: "2026-11-11", leave: "2026-11-13" }, today), { field: "arrive", message: "Choose an arrival day from today onwards." });
    assert.deepEqual(stayProblem({ arrive: "2026-11-13", leave: "2026-11-13" }, today), { field: "leave", message: "Choose a leaving day after the arrival day." });
    assert.equal(stayProblem({ arrive: "2026-11-13", leave: "2026-12-14" }, today)?.field, "leave");
    assert.equal(stayProblem({ arrive: "2028-06-01", leave: "2028-06-02" }, today)?.field, "arrive");
    assert.deepEqual(stayProblem({ arrive: "12/12/2026", leave: "2026-12-13" }, today), { field: "arrive", message: "Choose the day you arrive." });
  });
});

describe("availability", () => {
  const units = [testUnit("u1", "Unit 1"), testUnit("u2", "Unit 2"), { ...testUnit("u3", "Old unit"), active: false }, testUnit("u4", "Bath 1", "deluxe-double-bath")];
  const stay = { arrive: "2026-12-10", leave: "2026-12-13" };

  it("is free while one active unit is free, full when every one is blocked, and not set up without units", () => {
    assert.equal(apartmentStatus("family-shower", stay, units, [testBlock("b1", "u1", "2026-12-12", "2026-12-14")]), "free");
    const both = [testBlock("b1", "u1", "2026-12-12", "2026-12-14"), testBlock("b2", "u2", "2026-12-09", "2026-12-11")];
    assert.equal(apartmentStatus("family-shower", stay, units, both), "full");
    assert.equal(apartmentStatus("family-shower", { arrive: "2026-12-14", leave: "2026-12-15" }, units, both), "free");
    assert.equal(apartmentStatus("hidden-suite", stay, units, []), "not-set-up");
  });

  it("puts free apartments that fit first, and never says more than a status", () => {
    const apartments = [
      { slug: "deluxe-double-bath", sleeps: 2 },
      { slug: "family-shower", sleeps: 5 },
      { slug: "accessible-family", sleeps: 3 },
    ];
    const blocked = [testBlock("b1", "u4", "2026-12-10", "2026-12-11")];
    assert.deepEqual(publicAvailability(stay, 3, apartments, units, blocked), [
      { slug: "family-shower", status: "free", fits: true },
      { slug: "accessible-family", status: "not-set-up", fits: true },
      { slug: "deluxe-double-bath", status: "full", fits: false },
    ]);
  });

  it("gives a night-by-night calendar", () => {
    const blocks = [testBlock("b1", "u4", "2026-12-11", "2026-12-12")];
    assert.deepEqual(nightlyAvailability("deluxe-double-bath", "2026-12-10", "2026-12-13", units, blocks), [
      { date: "2026-12-10", status: "free" },
      { date: "2026-12-11", status: "full" },
      { date: "2026-12-12", status: "free" },
    ]);
  });
});

describe("inventory service", () => {
  it("checks a search's dates and group against today in Welkom", () => {
    const { service } = inventoryHarness({ now: "2026-11-11T22:30:00Z" });
    assert.equal(service.today(), "2026-11-12", "00:30 SAST is already the 12th");
    assert.deepEqual(service.checkSearch({ arrive: "2026-11-12", leave: "2026-11-14", guests: "3" }), {
      ok: true,
      value: { arrive: "2026-11-12", leave: "2026-11-14", guests: 3 },
    });
    const refused = service.checkSearch({ arrive: "2026-11-11", leave: "2026-11-14", guests: "0" });
    assert.equal(refused.ok, false);
    assert.deepEqual(Object.keys(refused.ok ? {} : refused.errors).sort(), ["arrive", "guests"]);
  });

  it("offers published apartments only, and refuses one that's too small or full", async () => {
    const { service, store } = inventoryHarness();
    await store.addUnit(testUnit("u1", "Unit 1"), { maxUnits: 10 });
    const search = { arrive: "2026-12-10", leave: "2026-12-12", guests: 3 };
    assert.deepEqual(
      (await service.search(search)).map((entry) => entry.slug),
      ["family-shower", "deluxe-double-bath"],
    );
    assert.deepEqual(await service.requestability("hidden-suite", search), { ok: false, reason: "unknown-apartment" });
    assert.deepEqual(await service.requestability("deluxe-double-bath", search), { ok: false, reason: "too-small" });
    const free = await service.requestability("family-shower", search);
    assert.equal(free.ok && free.status, "free");
    await store.addBlock(testBlock("b1", "u1", "2026-12-11", "2026-12-12"));
    assert.deepEqual(await service.requestability("family-shower", search), { ok: false, reason: "full" });
  });

  it("lets the owner and sales manage units and blocks, and records each change", async () => {
    const { service, audit } = inventoryHarness();
    const added = await service.addUnit(sales, { apartment: "family-shower", name: "Unit 1" });
    assert.equal(added.ok, true);
    const id = added.ok ? added.id : "";
    assert.deepEqual(await service.addUnit(owner, { apartment: "family-shower", name: "unit 1" }), { ok: false, errors: { name: "Another unit already has this name." } });
    assert.deepEqual(await service.addUnit(owner, { apartment: "nowhere", name: "Unit 9" }), { ok: false, errors: { apartment: "Choose an apartment from the list." } });
    const block = await service.addBlock(owner, { unitId: id, arrive: "2026-12-01", leave: "2026-12-04", reason: "maintenance", note: "Painting" });
    assert.equal(block.ok, true);
    assert.deepEqual(await service.addBlock(owner, { unitId: id, arrive: "2026-12-03", leave: "2026-12-05", reason: "owner", note: "" }), {
      ok: false,
      errors: { arrive: "This unit is already closed or booked on some of these nights." },
    });
    assert.deepEqual(await service.addBlock(owner, { unitId: id, arrive: "2026-11-01", leave: "2026-11-05", reason: "owner", note: "" }), {
      ok: false,
      errors: { arrive: "Choose a first night from today onwards." },
    });
    assert.equal((await service.removeBlock(owner, block.ok ? block.id : "")).ok, true);
    assert.equal((await service.changeUnit(owner, id, { apartment: "deluxe-double-bath", name: "Garden", active: false })).ok, true);
    assert.deepEqual(
      audit.events.map((event) => [event.category, event.action]),
      [
        ["bookings", "inventory.unit-added"],
        ["bookings", "inventory.block-added"],
        ["bookings", "inventory.block-removed"],
        ["bookings", "inventory.unit-changed"],
      ],
    );
    assert.match(audit.events[3]!.summary, /renamed from Unit 1, moved to Deluxe double apartment with bath, no longer offered/);
  });

  it("refuses admin and staff everything in the dashboard", async () => {
    const { service } = inventoryHarness();
    for (const actor of [admin, staff]) {
      await assert.rejects(service.overview(actor), TestNotAllowedError);
      await assert.rejects(service.addUnit(actor, { apartment: "family-shower", name: "Unit 1" }), TestNotAllowedError);
      await assert.rejects(service.addBlock(actor, {}), TestNotAllowedError);
      await assert.rejects(service.removeBlock(actor, "b1"), TestNotAllowedError);
      await assert.rejects(service.changeUnit(actor, "u1", {}), TestNotAllowedError);
      await assert.rejects(service.freeUnits(actor, "family-shower", { arrive: "2026-12-01", leave: "2026-12-02" }), TestNotAllowedError);
    }
  });

  it("keeps the nights of requests, bookings and channel stays out of reach of the manual controls", async () => {
    const { service, store } = inventoryHarness();
    await store.addUnit(testUnit("u1", "Unit 1"), { maxUnits: 10 });
    await store.addBlock(testBlock("b1", "u1", "2026-12-10", "2026-12-12", "request"));
    await store.addBlock({ ...testBlock("b2", "u1", "2026-12-12", "2026-12-14", "booking"), bookingId: "00000000-0000-4000-8000-0000000000b2" });
    await store.addBlock({ ...testBlock("b3", "u1", "2026-12-14", "2026-12-16", "channel"), channelEventId: "00000000-0000-4000-8000-0000000000c3" });
    for (const id of ["b1", "b2", "b3"]) {
      assert.deepEqual(await service.removeBlock(owner, id), { ok: false, errors: { form: "These nights belong to a booking or a channel's calendar, so they open when that changes." } }, id);
    }
    assert.equal((await store.blocksOverlapping({ arrive: "2026-12-10", leave: "2026-12-16" })).length, 3);
  });

  it("flags units whose apartment type has left the site's content", async () => {
    const { service, store, setApartmentTypes } = inventoryHarness();
    await store.addUnit(testUnit("u1", "Unit 1", "family-shower"), { maxUnits: 10 });
    setApartmentTypes([{ slug: "family-apartment", name: "Family apartment", sleeps: 5, published: true }]);
    assert.deepEqual((await service.overview(owner)).orphanUnits.map((unit) => unit.id), ["u1"]);
  });
});
