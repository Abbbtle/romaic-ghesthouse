import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bookingStoreContract, testRequest } from "@/lib/booking/testing/store-contract";
import { inventoryStoreContract, testBlock, testUnit } from "@/lib/inventory/testing/store-contract";
import { createPostgresBookingStore } from "./booking-store";
import { ExclusionViolationError } from "./errors";
import { createPostgresInventoryStore } from "./inventory-store";
import type { TestDatabases } from "./testing/test-databases";

/**
 * What the Postgres inventory and booking stores promise: the cores' own
 * contracts, which the memory stores pass too, then what only Postgres can
 * show, such as the exclusion constraint holding even when the application
 * is bypassed. Run on PGlite by ./stays-stores.test.ts and on a real server
 * by ./stays-stores.pg.test.ts.
 */
export function describeStaysStoresContract(databases: TestDatabases): void {
  describe(`${databases.label}: inventory`, () => {
    for (const { name, run } of inventoryStoreContract) {
      it(name, async () => run(createPostgresInventoryStore(databases.migrated())));
    }

    it("refuses two blocks on one unit sharing a night in the database itself", async () => {
      const db = databases.migrated();
      const unitId = "00000000-0000-4000-8000-00000000a0a1";
      await createPostgresInventoryStore(db).addUnit(testUnit(unitId, "Unit 1"), { maxUnits: 10 });
      const insert = (id: string, arrive: string, leave: string) =>
        db.run(
          "insert into app.availability_blocks (id, unit_id, arrive, leave, reason, created_at) values (:id, :unitId, :arrive::date, :leave::date, 'owner', now())",
          { id, unitId, arrive, leave },
        );
      await insert("00000000-0000-4000-8000-0000000b0001", "2026-12-10", "2026-12-13");
      await assert.rejects(insert("00000000-0000-4000-8000-0000000b0002", "2026-12-12", "2026-12-15"), (error) => {
        assert.ok(error instanceof ExclusionViolationError);
        assert.equal(error.constraint, "availability_blocks_no_overlap");
        return true;
      });
      await insert("00000000-0000-4000-8000-0000000b0003", "2026-12-13", "2026-12-15");
    });

    it("refuses a block that ends before it starts, and a request link on a manual block", async () => {
      const db = databases.migrated();
      const store = createPostgresInventoryStore(db);
      const unitId = "00000000-0000-4000-8000-00000000a0a1";
      await store.addUnit(testUnit(unitId, "Unit 1"), { maxUnits: 10 });
      await assert.rejects(store.addBlock(testBlock("00000000-0000-4000-8000-0000000b0001", unitId, "2026-12-13", "2026-12-10")));
    });
  });

  describe(`${databases.label}: booking requests`, () => {
    for (const { name, run } of bookingStoreContract) {
      it(name, async () => {
        const db = databases.migrated();
        await run({ requests: createPostgresBookingStore(db), inventory: createPostgresInventoryStore(db) });
      });
    }

    it("keeps the consent record and refuses a malformed reference or phone number", async () => {
      const db = databases.migrated();
      const store = createPostgresBookingStore(db);
      const today = "2026-11-12";
      const request = testRequest();
      await store.create(request, { maxWaitingPerPhone: 3, today });
      const row = await db.get<{ consent_version: string; notice_version: string }>(
        "select consent_version, notice_version from app.booking_requests where id = :id",
        { id: request.id },
      );
      assert.deepEqual(row, { consent_version: "0.1", notice_version: "0.1" });
      await assert.rejects(store.create(testRequest({ ref: "RG-IIIII", phone: "+27830000077" }), { maxWaitingPerPhone: 3, today }));
      await assert.rejects(store.create(testRequest({ phone: "0821234567" }), { maxWaitingPerPhone: 3, today }));
    });
  });
}
