import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { quoteFor } from "./rates";
import { rateHarness, testActor, TestNotAllowedError } from "./testing/harness";
import { createMemoryRateStore } from "./testing/memory-store";
import { rateStoreContract, testPlan, testSeason } from "./testing/store-contract";

describe("quoting a stay", () => {
  const plan = testPlan("family-shower", { nightlyCents: 85_000, baseGuests: 2, extraGuestCents: 15_000, minNights: 2 });

  it("prices each night at the plan's rate, plus each extra guest", () => {
    const quote = quoteFor(plan, [], { arrive: "2026-11-20", leave: "2026-11-23" }, 4);
    assert.equal(quote?.totalCents, 3 * (85_000 + 2 * 15_000));
    assert.equal(quote?.nights.length, 3);
    assert.deepEqual(quote?.nights[0], { date: "2026-11-20", nightlyCents: 85_000, extraCents: 30_000, seasonId: null });
    assert.equal(quote?.meetsMinimum, true);
  });

  it("uses a season's price on its nights only, and its longer minimum stay", () => {
    const festive = testSeason("s1", "2026-12-24", "2026-12-27", { minNights: 3, prices: { "family-shower": 120_000 } });
    const quote = quoteFor(plan, [festive], { arrive: "2026-12-23", leave: "2026-12-25" }, 2);
    assert.deepEqual(
      quote?.nights.map((night) => [night.date, night.nightlyCents, night.seasonId]),
      [
        ["2026-12-23", 85_000, null],
        ["2026-12-24", 120_000, "s1"],
      ],
    );
    assert.equal(quote?.totalCents, 205_000);
    assert.equal(quote?.minNights, 3);
    assert.equal(quote?.meetsMinimum, false);
  });

  it("keeps the plan's price in a season that doesn't price this apartment, but still applies its minimum", () => {
    const other = testSeason("s2", "2026-12-01", "2026-12-31", { minNights: 4, prices: { "deluxe-double-bath": 99_000 } });
    const quote = quoteFor(plan, [other], { arrive: "2026-12-10", leave: "2026-12-12" }, 1);
    assert.equal(quote?.totalCents, 170_000);
    assert.equal(quote?.nights[0]?.seasonId, null);
    assert.equal(quote?.minNights, 4);
  });

  it("gives no price without a plan in use", () => {
    assert.equal(quoteFor(null, [], { arrive: "2026-12-10", leave: "2026-12-12" }, 2), null);
    assert.equal(quoteFor({ ...plan, active: false }, [], { arrive: "2026-12-10", leave: "2026-12-12" }, 2), null);
  });
});

describe("rate service", () => {
  const owner = testActor("owner");
  const sales = testActor("sales");

  it("lets the owner and sales set a plan, checks it, and records it", async () => {
    const { service, audit } = rateHarness();
    assert.deepEqual(await service.savePlan(sales, "family-shower", { nightly: "850", baseGuests: "2", extraGuest: "150", minNights: "2", active: "on" }), { ok: true });
    assert.deepEqual((await service.overview(owner)).plans["family-shower"]?.nightlyCents, 85_000);
    assert.match(audit.events[0]!.summary, /^Set Family room with shower to R850 a night for up to 2, R150 per extra guest, at least 2 nights$/);
    assert.deepEqual(await service.savePlan(owner, "deluxe-double-bath", { nightly: "900", baseGuests: "3", extraGuest: "0", minNights: "1", active: "on" }), {
      ok: false,
      errors: { baseGuests: "This room sleeps up to 2, so the price can be for 2 at most." },
    });
    assert.equal((await service.savePlan(owner, "nowhere", { nightly: "900", baseGuests: "1", extraGuest: "0", minNights: "1" })).ok, false);
    const bad = await service.savePlan(owner, "family-shower", { nightly: "0.50", baseGuests: "0", extraGuest: "abc", minNights: "40" });
    assert.deepEqual(Object.keys(bad.ok ? {} : bad.errors).sort(), ["baseGuests", "extraGuest", "minNights"]);
  });

  it("quotes from the plan and seasons, publicly, and lists the 'from' prices in use", async () => {
    const { service } = rateHarness();
    await service.savePlan(owner, "family-shower", { nightly: "850", baseGuests: "2", extraGuest: "150", minNights: "1", active: "on" });
    await service.savePlan(owner, "deluxe-double-bath", { nightly: "950", baseGuests: "2", extraGuest: "0", minNights: "1" });
    await service.addSeason(owner, { name: "Festive", firstNight: "2026-12-24", lastNight: "2026-12-26", minNights: "", "price.family-shower": "1200" });
    const quote = await service.quote("family-shower", { arrive: "2026-12-23", leave: "2026-12-26" }, 3);
    assert.equal(quote?.totalCents, 85_000 + 2 * 120_000 + 3 * 15_000);
    assert.deepEqual(await service.fromPrices(), { "family-shower": 85_000 }, "the inactive plan gives no price");
    assert.equal(await service.quote("deluxe-double-bath", { arrive: "2026-12-23", leave: "2026-12-26" }, 2), null);
  });

  it("keeps seasons apart, reads their prices, and refuses one that changes nothing", async () => {
    const { service, audit } = rateHarness();
    const added = await service.addSeason(owner, { name: "Festive", firstNight: "2026-12-15", lastNight: "2027-01-05", minNights: "3", "price.family-shower": "1 100", "price.unknown": "999" });
    assert.equal(added.ok, true);
    assert.deepEqual(await service.addSeason(owner, { name: "Overlap", firstNight: "2027-01-05", lastNight: "2027-01-10", minNights: "2" }), {
      ok: false,
      errors: { firstNight: "This season shares nights with another. Seasons can't overlap: change the dates or the other season." },
    });
    assert.deepEqual(await service.addSeason(owner, { name: "Nothing", firstNight: "2027-02-01", lastNight: "2027-02-02", minNights: "" }), {
      ok: false,
      errors: { form: "Give the season a price for at least one room type, or a minimum stay, or it changes nothing." },
    });
    assert.deepEqual(await service.addSeason(owner, { name: "Bad", firstNight: "2027-02-05", lastNight: "2027-02-01", minNights: "", "price.family-shower": "R12x" }), {
      ok: false,
      errors: { lastNight: "Choose a last night on or after the first night.", "price.family-shower": "Enter the price in rand, like 950, or leave it empty." },
    });
    const [season] = (await service.overview(owner)).seasons;
    assert.deepEqual(season?.prices, { "family-shower": 110_000 }, "unknown apartments are ignored");
    assert.deepEqual(season?.nights, { arrive: "2026-12-15", leave: "2027-01-06" }, "the last night is in");
    assert.equal((await service.changeSeason(owner, season!.id, { name: "Christmas", firstNight: "2026-12-20", lastNight: "2026-12-31", minNights: "2", "price.deluxe-double-bath": "1300" })).ok, true);
    assert.equal((await service.removeSeason(owner, season!.id)).ok, true);
    assert.deepEqual(
      audit.events.map((event) => event.action),
      ["rates.season-added", "rates.season-changed", "rates.season-removed"],
    );
    assert.match(audit.events[0]!.summary, /^Added the season Festive, 15 Dec 2026 – 5 Jan 2027$/);
  });

  it("refuses admin and staff everything on the Rates page", async () => {
    const { service } = rateHarness();
    for (const role of ["admin", "staff"] as const) {
      const actor = testActor(role);
      await assert.rejects(service.overview(actor), TestNotAllowedError);
      await assert.rejects(service.savePlan(actor, "family-shower", {}), TestNotAllowedError);
      await assert.rejects(service.removePlan(actor, "family-shower"), TestNotAllowedError);
      await assert.rejects(service.addSeason(actor, {}), TestNotAllowedError);
      await assert.rejects(service.changeSeason(actor, "s", {}), TestNotAllowedError);
      await assert.rejects(service.removeSeason(actor, "s"), TestNotAllowedError);
    }
  });
});

describe("memory rate store", () => {
  for (const { name, run } of rateStoreContract) {
    it(name, async () => run(createMemoryRateStore()));
  }
});
