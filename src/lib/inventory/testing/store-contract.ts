import type { InventoryStore } from "../ports";
import type { AvailabilityBlock, Unit } from "../units";

/**
 * What every InventoryStore must do, as cases a test file runs against its
 * own store, each on a fresh, empty one:
 *
 *   for (const { name, run } of inventoryStoreContract) it(name, async () => run(await emptyStore()));
 *
 * The memory store runs it under `npm test`; the Postgres store runs it on
 * PGlite and on a real server. Kept free of node:test so it stays a plain
 * module of the core.
 */
export type InventoryStoreCase = { name: string; run: (store: InventoryStore) => Promise<void> };

const ownerId = "00000000-0000-4000-8000-0000000000a1";
const at = new Date("2026-11-12T08:00:00.000Z");

export function testUnit(id: string, name: string, apartment = "family-shower", sort = 1): Unit {
  return { id, apartment, name, sort, active: true };
}

export function testBlock(id: string, unitId: string, arrive: string, leave: string, reason: AvailabilityBlock["reason"] = "owner"): AvailabilityBlock {
  return { id, unitId, stay: { arrive, leave }, reason, note: null, requestId: null, bookingId: null, channelEventId: null, createdBy: ownerId, createdAt: at };
}

const unitA = "00000000-0000-4000-8000-00000000a0a1";
const unitB = "00000000-0000-4000-8000-00000000a0b2";
const block1 = "00000000-0000-4000-8000-0000000b0001";
const block2 = "00000000-0000-4000-8000-0000000b0002";
const block3 = "00000000-0000-4000-8000-0000000b0003";

export const inventoryStoreContract: readonly InventoryStoreCase[] = [
  {
    name: "starts empty",
    async run(store) {
      expectSame(await store.units(), [], "units");
      expectSame(await store.blocksOverlapping({ arrive: "2026-01-01", leave: "2027-01-01" }), [], "blocks");
    },
  },
  {
    name: "adds units with unique names, ignoring case, up to the limit",
    async run(store) {
      expectSame(await store.addUnit(testUnit(unitA, "Unit 1"), { maxUnits: 2 }), { status: "added" }, "first");
      expectSame(await store.addUnit(testUnit(unitB, "unit 1"), { maxUnits: 2 }), { status: "name-taken" }, "same name");
      expectSame(await store.addUnit(testUnit(unitB, "Unit 2", "deluxe-double-bath", 2), { maxUnits: 2 }), { status: "added" }, "second");
      const third = "00000000-0000-4000-8000-0000000000c3";
      expectSame(await store.addUnit(testUnit(third, "Unit 3"), { maxUnits: 2 }), { status: "too-many" }, "over the limit");
      const units = (await store.units()).sort((a, b) => a.sort - b.sort);
      expectSame(units, [testUnit(unitA, "Unit 1"), testUnit(unitB, "Unit 2", "deluxe-double-bath", 2)], "stored");
      expectSame(await store.unit(unitB), testUnit(unitB, "Unit 2", "deluxe-double-bath", 2), "one");
    },
  },
  {
    name: "renames, moves and turns units off, keeping names unique",
    async run(store) {
      await store.addUnit(testUnit(unitA, "Unit 1"), { maxUnits: 10 });
      await store.addUnit(testUnit(unitB, "Unit 2"), { maxUnits: 10 });
      expectSame(await store.changeUnit(unitB, { name: "UNIT 1", apartment: "family-shower", active: true }), { status: "name-taken" }, "clash");
      expectSame(await store.changeUnit(unitB, { name: "Garden", apartment: "deluxe-double-bath", active: false }), { status: "changed" }, "change");
      expectSame(await store.unit(unitB), { id: unitB, apartment: "deluxe-double-bath", name: "Garden", sort: 1, active: false }, "changed");
      const missing = "00000000-0000-4000-8000-0000000000ff";
      expectSame(await store.changeUnit(missing, { name: "X", apartment: "a", active: true }), { status: "missing" }, "missing");
    },
  },
  {
    name: "never lets two blocks on one unit share a night, but back-to-back stays are fine",
    async run(store) {
      await store.addUnit(testUnit(unitA, "Unit 1"), { maxUnits: 10 });
      await store.addUnit(testUnit(unitB, "Unit 2"), { maxUnits: 10 });
      expectSame(await store.addBlock(testBlock(block1, unitA, "2026-12-10", "2026-12-13")), { status: "added" }, "first");
      expectSame(await store.addBlock(testBlock(block2, unitA, "2026-12-12", "2026-12-14")), { status: "overlaps" }, "shares the 12th");
      expectSame(await store.addBlock(testBlock(block2, unitA, "2026-12-13", "2026-12-15")), { status: "added" }, "arrives as the other leaves");
      expectSame(await store.addBlock(testBlock(block3, unitB, "2026-12-10", "2026-12-13")), { status: "added" }, "another unit");
    },
  },
  {
    name: "refuses blocks on a missing or inactive unit",
    async run(store) {
      expectSame(await store.addBlock(testBlock(block1, unitA, "2026-12-10", "2026-12-11")), { status: "unit-unavailable" }, "missing");
      await store.addUnit({ ...testUnit(unitA, "Unit 1"), active: false }, { maxUnits: 10 });
      expectSame(await store.addBlock(testBlock(block1, unitA, "2026-12-10", "2026-12-11")), { status: "unit-unavailable" }, "inactive");
    },
  },
  {
    name: "finds the blocks that share a night with a range, and one by id",
    async run(store) {
      await store.addUnit(testUnit(unitA, "Unit 1"), { maxUnits: 10 });
      await store.addBlock(testBlock(block1, unitA, "2026-12-10", "2026-12-13"));
      await store.addBlock(testBlock(block2, unitA, "2026-12-20", "2026-12-22", "maintenance"));
      const ids = async (arrive: string, leave: string) => (await store.blocksOverlapping({ arrive, leave })).map((block) => block.id).sort();
      expectSame(await ids("2026-12-13", "2026-12-20"), [], "the gap between them");
      expectSame(await ids("2026-12-12", "2026-12-21"), [block1, block2], "both");
      expectSame(await ids("2026-12-01", "2026-12-11"), [block1], "the first night");
      expectSame(await store.block(block2), testBlock(block2, unitA, "2026-12-20", "2026-12-22", "maintenance"), "by id");
    },
  },
  {
    name: "removes manual blocks only",
    async run(store) {
      await store.addUnit(testUnit(unitA, "Unit 1"), { maxUnits: 10 });
      await store.addBlock(testBlock(block1, unitA, "2026-12-10", "2026-12-13"));
      await store.addBlock(testBlock(block2, unitA, "2026-12-20", "2026-12-22", "request"));
      expectSame(await store.removeManualBlock(block2), false, "a request's block");
      expectSame(await store.removeManualBlock(block1), true, "a manual block");
      expectSame(await store.removeManualBlock(block1), false, "already gone");
      expectSame((await store.blocksOverlapping({ arrive: "2026-12-01", leave: "2027-01-01" })).map((block) => block.id), [block2], "left");
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
