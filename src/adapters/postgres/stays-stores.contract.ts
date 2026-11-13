import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bookingStoreContract, testRequest } from "@/lib/booking/testing/store-contract";
import { inventoryStoreContract, testBlock, testUnit } from "@/lib/inventory/testing/store-contract";
import { createPostgresBookingStore } from "./booking-store";
import { ExclusionViolationError } from "./errors";
import { createPostgresInventoryStore } from "./inventory-store";
import { blockOf, reservationStoreContract, testBooking, testGuest } from "@/lib/reservations/testing/store-contract";
import { createPostgresReservationStore } from "./reservation-store";
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

  describe(`${databases.label}: anonymised guests`, () => {
    it("won't take a guest's details back once they're anonymised", async () => {
      const db = databases.migrated();
      const reservations = createPostgresReservationStore(db);
      const inventory = createPostgresInventoryStore(db);
      await inventory.addUnit(testUnit("00000000-0000-4000-8000-00000000a0a1", "Unit 1"), { maxUnits: 10 });
      const guest = testGuest("00000000-0000-4000-8000-00000000c001");
      const booking = testBooking("00000000-0000-4000-8000-00000000d001", guest.id);
      await reservations.create({ newGuest: guest, booking, block: blockOf(booking, "00000000-0000-4000-8000-0000000b0001") });
      await db.run("update app.guests set name = 'Anonymised guest', phone = null, email = null, notes = null, anonymised_at = now() where id = :id", { id: guest.id });
      assert.equal(await reservations.updateGuest({ ...guest, name: "Thandi Mokoena" }), false);
      assert.equal((await reservations.guest(guest.id))?.name, "Anonymised guest");
    });
  });

  describe(`${databases.label}: reservations`, () => {
    for (const { name, run } of reservationStoreContract) {
      it(name, async () => {
        const db = databases.migrated();
        const inventory = createPostgresInventoryStore(db);
        await run({
          reservations: createPostgresReservationStore(db),
          requests: createPostgresBookingStore(db),
          inventory,
          // The channels store's own tables, filled directly: one calendar per unit and channel, its stay, and the stay's block.
          async seedChannelStay(stay, block) {
            const calendarId = `00000000-0000-4000-8000-${stay.unitId.slice(-12)}`.replace(/^(.{24}).{4}/, "$1ca1e");
            await db.run(
              `insert into app.channel_calendars (id, unit_id, channel, url_cipher, url_host, created_at)
               values (:calendarId, :unitId, :channel, 'sealed', 'ical.example.com', now()) on conflict (unit_id, channel) do nothing`,
              { calendarId, unitId: stay.unitId, channel: stay.channel },
            );
            await db.run(
              `insert into app.channel_events (id, calendar_id, uid, arrive, leave, status, booking_id, first_seen, last_seen)
               select :id::uuid, id, :id::text, :arrive::date, :leave::date, :status, :bookingId::uuid, now(), now() from app.channel_calendars where unit_id = :unitId and channel = :channel`,
              { id: stay.id, unitId: stay.unitId, channel: stay.channel, arrive: stay.stay.arrive, leave: stay.stay.leave, status: stay.status, bookingId: stay.bookingId },
            );
            if (block) assert.equal((await inventory.addBlock(block)).status, "added");
          },
        });
      });
    }
  });
}
