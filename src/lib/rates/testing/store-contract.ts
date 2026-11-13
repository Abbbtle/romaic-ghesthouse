import type { RateStore } from "../ports";
import type { RatePlan, Season } from "../rates";

/**
 * What every RateStore must do, as cases run on a fresh, empty store:
 *
 *   for (const { name, run } of rateStoreContract) it(name, async () => run(await emptyStore()));
 */
export type RateStoreCase = { name: string; run: (store: RateStore) => Promise<void> };

const ownerId = "00000000-0000-4000-8000-0000000000a1";
const at = new Date("2026-11-12T08:00:00.000Z");

export function testPlan(apartment: string, fields: Partial<RatePlan> = {}): RatePlan {
  return { apartment, nightlyCents: 85_000, baseGuests: 2, extraGuestCents: 15_000, minNights: 1, active: true, updatedAt: at, updatedBy: ownerId, ...fields };
}

export function testSeason(id: string, arrive: string, leave: string, fields: Partial<Season> = {}): Season {
  return { id, name: "Festive season", nights: { arrive, leave }, minNights: null, prices: { "family-shower": 110_000 }, updatedAt: at, updatedBy: ownerId, ...fields };
}

const season1 = "00000000-0000-4000-8000-00000000e001";
const season2 = "00000000-0000-4000-8000-00000000e002";

export const rateStoreContract: readonly RateStoreCase[] = [
  {
    name: "starts with no plans and no seasons",
    async run(store) {
      expectSame(await store.plans(), [], "plans");
      expectSame(await store.seasons(), [], "seasons");
      expectSame(await store.plan("family-shower"), null, "plan");
    },
  },
  {
    name: "adds, replaces and removes an apartment's plan",
    async run(store) {
      await store.savePlan(testPlan("family-shower"));
      await store.savePlan(testPlan("deluxe-double-bath", { nightlyCents: 95_050, baseGuests: 1, extraGuestCents: 0, minNights: 2, active: false }));
      expectSame(await store.plan("deluxe-double-bath"), testPlan("deluxe-double-bath", { nightlyCents: 95_050, baseGuests: 1, extraGuestCents: 0, minNights: 2, active: false }), "read back");
      await store.savePlan(testPlan("family-shower", { nightlyCents: 90_000 }));
      expectSame((await store.plan("family-shower"))?.nightlyCents, 90_000, "replaced");
      expectSame((await store.plans()).map((plan) => plan.apartment), ["deluxe-double-bath", "family-shower"], "both, by apartment");
      expectSame(await store.removePlan("family-shower"), true, "remove");
      expectSame(await store.removePlan("family-shower"), false, "already gone");
    },
  },
  {
    name: "keeps a season's prices, and never lets two seasons share a night",
    async run(store) {
      const festive = testSeason(season1, "2026-12-15", "2027-01-06", { minNights: 3, prices: { "family-shower": 110_000, "deluxe-double-bath": 120_000 } });
      expectSame(await store.addSeason(festive), { status: "saved" }, "add");
      expectSame(await store.season(season1), festive, "read back");
      expectSame(await store.addSeason(testSeason(season2, "2027-01-05", "2027-01-10")), { status: "overlaps" }, "shares the 5th");
      expectSame(await store.addSeason(testSeason(season2, "2027-01-06", "2027-01-10", { name: "January", prices: {} , minNights: 2 })), { status: "saved" }, "starts as the other ends");
      expectSame((await store.seasons()).map((season) => season.id), [season1, season2], "earliest first");
      expectSame((await store.seasonsOverlapping({ arrive: "2027-01-05", leave: "2027-01-07" })).map((season) => season.id), [season1, season2], "both");
      expectSame((await store.seasonsOverlapping({ arrive: "2026-12-01", leave: "2026-12-15" })).map((season) => season.id), [], "before");
    },
  },
  {
    name: "changes a season and replaces its prices, refusing an overlap or a season that's gone",
    async run(store) {
      await store.addSeason(testSeason(season1, "2026-12-15", "2027-01-06"));
      await store.addSeason(testSeason(season2, "2027-02-01", "2027-02-10"));
      const changed = testSeason(season1, "2026-12-20", "2027-01-03", { name: "Christmas", prices: { "deluxe-double-bath": 130_000 } });
      expectSame(await store.changeSeason(changed), { status: "saved" }, "change");
      expectSame(await store.season(season1), changed, "replaced, old price gone");
      expectSame(await store.changeSeason({ ...changed, nights: { arrive: "2027-01-01", leave: "2027-02-02" } }), { status: "overlaps" }, "overlap");
      expectSame(await store.changeSeason(testSeason("00000000-0000-4000-8000-00000000e0ff", "2027-03-01", "2027-03-02")), { status: "missing" }, "gone");
      expectSame(await store.removeSeason(season1), true, "remove");
      expectSame(await store.season(season1), null, "removed");
      expectSame(await store.removeSeason(season1), false, "already gone");
    },
  },
];

/** JSON with object keys in order, so two stores may build records in different orders. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );
}

function expectSame(actual: unknown, expected: unknown, what: string): void {
  const a = canonical(actual);
  const e = canonical(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}
