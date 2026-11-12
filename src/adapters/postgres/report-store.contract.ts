import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { testBlock, testUnit } from "@/lib/inventory/testing/store-contract";
import { testJournal, testLine } from "@/lib/ledger/testing/store-contract";
import { testPayment } from "@/lib/money/testing/store-contract";
import { balancesOf } from "@/lib/reports/reports";
import type { Booking } from "@/lib/reservations/reservations";
import { blockOf, testBooking, testGuest } from "@/lib/reservations/testing/store-contract";
import { testTask } from "@/lib/tasks/testing/store-contract";
import type { Database } from "./database";
import { createPostgresInventoryStore } from "./inventory-store";
import { createPostgresLedgerStore } from "./ledger-store";
import { createPostgresMoneyStore } from "./money-store";
import { createPostgresReportStore } from "./report-store";
import { createPostgresReservationStore } from "./reservation-store";
import { createPostgresTaskStore } from "./task-store";
import type { TestDatabases } from "./testing/test-databases";

const ownerId = "00000000-0000-4000-8000-0000000000a1";
const unit1 = "00000000-0000-4000-8000-00000000a0a1";
const unit2 = "00000000-0000-4000-8000-00000000a0b2";
const guestId = "00000000-0000-4000-8000-00000000c001";
const id = (n: number) => `00000000-0000-4000-8000-0000000dd${String(n).padStart(3, "0")}`;
const november = { from: "2026-11-01", until: "2026-11-30" };
// 1 Nov to 30 Nov in Johannesburg (UTC+2).
const novemberInstants = { start: new Date("2026-10-31T22:00:00Z"), end: new Date("2026-11-30T22:00:00Z") };

/** Two units, and bookings made through the reservations store (each with its own block), moved to `status` when it isn't confirmed. */
async function withBookings(db: Database, bookings: { n: number; ref: string; fields: Partial<Booking>; status?: Booking["status"]; at?: string }[]) {
  const inventory = createPostgresInventoryStore(db);
  await inventory.addUnit(testUnit(unit1, "Unit 1", "family-shower", 1), { maxUnits: 10 });
  await inventory.addUnit(testUnit(unit2, "Unit 2", "studio", 2), { maxUnits: 10 });
  const reservations = createPostgresReservationStore(db);
  let first = true;
  for (const { n, ref, fields, status, at } of bookings) {
    const booking = testBooking(id(n), guestId, { ref, ...fields, status: "confirmed" });
    const outcome = await reservations.create({ newGuest: first ? testGuest(guestId) : null, booking, block: blockOf(booking, id(n + 100)) });
    assert.equal(outcome.status, "created", ref);
    first = false;
    if (status && status !== "confirmed") {
      const moved = await reservations.setStatus({ bookingId: booking.id, from: ["confirmed"], to: status, at: new Date(at ?? "2026-11-12T08:00:00Z"), releaseNights: status === "cancelled" || status === "no-show" });
      assert.equal(moved, true, ref);
    }
  }
}

/**
 * The Postgres report store: plain reads of what the other stores wrote,
 * each through those stores, so the rows look exactly as the site makes
 * them. Run on PGlite by ./report-store.test.ts and on a real server by
 * ./report-store.pg.test.ts.
 */
export function describeReportStoreContract(databases: TestDatabases): void {
  describe(`${databases.label}: reports`, () => {
    it("reads units in order, switched on or off", async () => {
      const db = databases.migrated();
      await withBookings(db, []);
      await db.run("update app.units set active = false where id = :id", { id: unit2 });
      assert.deepEqual(await createPostgresReportStore(db).units(), [
        { id: unit1, apartment: "family-shower", active: true },
        { id: unit2, apartment: "studio", active: false },
      ]);
    });

    it("reads bookings that hold their nights around the dates, arriving, staying or leaving, and no others", async () => {
      const db = databases.migrated();
      await withBookings(db, [
        { n: 1, ref: "RG-B2C3D", fields: { unitId: unit1, stay: { arrive: "2026-11-10", leave: "2026-11-13" } } },
        { n: 2, ref: "RG-B2C3E", fields: { unitId: unit1, stay: { arrive: "2026-10-28", leave: "2026-11-01" } }, status: "checked-out" },
        { n: 3, ref: "RG-B2C3F", fields: { unitId: unit2, stay: { arrive: "2026-11-05", leave: "2026-11-07" } }, status: "cancelled" },
        { n: 4, ref: "RG-B2C3G", fields: { unitId: unit1, stay: { arrive: "2026-12-05", leave: "2026-12-08" } } },
        { n: 5, ref: "RG-B2C3H", fields: { unitId: unit2, stay: { arrive: "2026-11-30", leave: "2026-12-02" } }, status: "checked-in" },
      ]);
      assert.deepEqual(await createPostgresReportStore(db).staysAround(november), [
        { unitId: unit1, status: "checked-out", stay: { arrive: "2026-10-28", leave: "2026-11-01" } },
        { unitId: unit1, status: "confirmed", stay: { arrive: "2026-11-10", leave: "2026-11-13" } },
        { unitId: unit2, status: "checked-in", stay: { arrive: "2026-11-30", leave: "2026-12-02" } },
      ]);
    });

    it("reads closures, channel stays and waiting requests with a night in the dates, never bookings' own blocks", async () => {
      const db = databases.migrated();
      await withBookings(db, [{ n: 1, ref: "RG-B2C3D", fields: { unitId: unit1, stay: { arrive: "2026-11-10", leave: "2026-11-13" } } }]);
      const inventory = createPostgresInventoryStore(db);
      for (const block of [
        testBlock(id(201), unit2, "2026-11-20", "2026-11-22", "owner"),
        testBlock(id(202), unit1, "2026-10-29", "2026-11-03", "maintenance"),
        testBlock(id(203), unit2, "2026-11-15", "2026-11-16", "request"),
        testBlock(id(204), unit2, "2026-10-20", "2026-11-01", "owner"),
        testBlock(id(205), unit2, "2026-12-01", "2026-12-04", "maintenance"),
      ]) {
        assert.equal((await inventory.addBlock(block)).status, "added");
      }
      // A channel stay's block points at its imported event: the channels store's tables, filled directly.
      await db.run(
        `insert into app.channel_calendars (id, unit_id, channel, url_cipher, url_host, created_at)
         values (:calendarId, :unitId, 'booking-com', 'sealed', 'ical.example.com', now())`,
        { calendarId: id(300), unitId: unit2 },
      );
      await db.run(
        `insert into app.channel_events (id, calendar_id, uid, arrive, leave, status, booking_id, first_seen, last_seen)
         values (:id, :calendarId, 'stay-1', '2026-11-25', '2026-11-27', 'placeholder', null, now(), now())`,
        { id: id(301), calendarId: id(300) },
      );
      assert.equal((await inventory.addBlock({ ...testBlock(id(206), unit2, "2026-11-25", "2026-11-27", "channel"), channelEventId: id(301) })).status, "added");

      assert.deepEqual(await createPostgresReportStore(db).blocksWithin(november), [
        { unitId: unit1, reason: "maintenance", stay: { arrive: "2026-10-29", leave: "2026-11-03" } },
        { unitId: unit2, reason: "request", stay: { arrive: "2026-11-15", leave: "2026-11-16" } },
        { unitId: unit2, reason: "owner", stay: { arrive: "2026-11-20", leave: "2026-11-22" } },
        { unitId: unit2, reason: "channel", stay: { arrive: "2026-11-25", leave: "2026-11-27" } },
      ]);
    });

    it("reads when housekeeping tasks were finished between two instants, and nothing else", async () => {
      const db = databases.migrated();
      await withBookings(db, []);
      const tasks = createPostgresTaskStore(db);
      const done = (at: string) => ({ status: "done" as const, startedAt: new Date(at), doneAt: new Date(at), doneBy: ownerId });
      for (const task of [
        testTask(id(401), { kind: "housekeeping", ...done("2026-11-10T08:00:00Z") }),
        testTask(id(402), { kind: "housekeeping", ...done("2026-10-31T21:59:59Z") }),
        testTask(id(403), { kind: "housekeeping", ...done("2026-11-30T22:00:00Z") }),
        testTask(id(404), { kind: "maintenance", ...done("2026-11-11T08:00:00Z") }),
        testTask(id(405), { kind: "housekeeping", status: "open" }),
        testTask(id(406), { kind: "housekeeping", ...done("2026-10-31T22:00:00Z") }),
      ]) {
        assert.equal((await tasks.create(task)).status, "created");
      }
      assert.deepEqual(await createPostgresReportStore(db).cleansDone(novemberInstants), [new Date("2026-10-31T22:00:00Z"), new Date("2026-11-10T08:00:00Z")]);
    });

    it("reads stays checked out between two instants, with their channel, nights and total", async () => {
      const db = databases.migrated();
      await withBookings(db, [
        { n: 1, ref: "RG-B2C3D", fields: { unitId: unit1, channel: "booking-com", stay: { arrive: "2026-11-02", leave: "2026-11-05" }, totalCents: 360_000 }, status: "checked-out", at: "2026-11-05T07:30:00Z" },
        { n: 2, ref: "RG-B2C3E", fields: { unitId: unit2, stay: { arrive: "2026-11-27", leave: "2026-12-01" } }, status: "checked-out", at: "2026-11-30T22:15:00Z" },
        { n: 3, ref: "RG-B2C3F", fields: { unitId: unit1, stay: { arrive: "2026-11-10", leave: "2026-11-13" } }, status: "checked-in" },
      ]);
      assert.deepEqual(await createPostgresReportStore(db).checkedOut(novemberInstants), [
        { bookingId: id(1), channel: "booking-com", stay: { arrive: "2026-11-02", leave: "2026-11-05" }, totalCents: 360_000, checkedOutAt: new Date("2026-11-05T07:30:00Z") },
      ]);
    });

    it("reads journals on Channel commission in the dates, with their net on it and the accounts on their other side", async () => {
      const db = databases.migrated();
      const ledger = createPostgresLedgerStore(db);
      const journal = (n: number, date: string, lines: ReturnType<typeof testLine>[]) => testJournal({ id: id(n), date, memo: "Commission", lines });
      for (const posted of [
        journal(501, "2026-11-03", [testLine("5000", "debit", 45_000), testLine("1110", "credit", 45_000)]),
        journal(502, "2026-11-04", [testLine("1110", "debit", 5_000), testLine("5000", "credit", 5_000)]),
        journal(503, "2026-11-05", [testLine("1000", "debit", 9_000), testLine("3000", "credit", 9_000)]),
        journal(504, "2026-10-31", [testLine("5000", "debit", 7_000), testLine("1110", "credit", 7_000)]),
        journal(505, "2026-11-30", [testLine("5000", "debit", 1_500), testLine("5000", "debit", 500), testLine("1000", "credit", 2_000)]),
      ]) {
        assert.equal((await ledger.post(posted)).status, "posted");
      }
      assert.deepEqual(await createPostgresReportStore(db).commission(november), [
        { journalId: id(501), date: "2026-11-03", cents: 45_000, counterAccounts: ["1110"] },
        { journalId: id(502), date: "2026-11-04", cents: -5_000, counterAccounts: ["1110"] },
        { journalId: id(505), date: "2026-11-30", cents: 2_000, counterAccounts: ["1000"] },
      ]);
    });

    it("lists bookings that hold their nights and aren't paid up, with every payment, for the money core to sum", async () => {
      const db = databases.migrated();
      await withBookings(db, [
        { n: 1, ref: "RG-B2C3D", fields: { unitId: unit1, stay: { arrive: "2026-12-10", leave: "2026-12-13" }, totalCents: 240_000 } },
        { n: 2, ref: "RG-B2C3E", fields: { unitId: unit2, stay: { arrive: "2026-11-02", leave: "2026-11-05" }, totalCents: 100_000, depositDueCents: 0 }, status: "checked-out" },
        { n: 3, ref: "RG-B2C3F", fields: { unitId: unit2, stay: { arrive: "2026-11-10", leave: "2026-11-12" }, totalCents: 50_000, depositDueCents: 0 }, status: "cancelled" },
        { n: 4, ref: "RG-B2C3G", fields: { unitId: unit1, stay: { arrive: "2026-11-20", leave: "2026-11-22" }, totalCents: 80_000, depositDueCents: 0 }, status: "checked-in" },
      ]);
      const money = createPostgresMoneyStore(db);
      await money.recordPayment(testPayment(id(1), { amountCents: 60_000 }));
      await money.recordPayment(testPayment(id(2), { amountCents: 100_000 }));
      const typo = testPayment(id(4), { amountCents: 80_000 });
      await money.recordPayment(typo);
      assert.equal(await money.voidPayment(typo.id, new Date("2026-11-21T08:00:00Z"), "Typed against the wrong booking"), true);

      const owing = await createPostgresReportStore(db).owing();
      assert.deepEqual(
        owing.map((booking) => [booking.ref, booking.status, booking.guestName, booking.totalCents, booking.payments.length]),
        [
          ["RG-B2C3G", "checked-in", "Thandi Mokoena", 80_000, 1],
          ["RG-B2C3D", "confirmed", "Thandi Mokoena", 240_000, 1],
        ],
      );
      assert.deepEqual(
        balancesOf(owing).rows.map((row) => [row.ref, row.balanceCents]),
        [
          ["RG-B2C3G", 80_000],
          ["RG-B2C3D", 180_000],
        ],
      );
    });

    it("reads channels' names and the month the financial year ends", async () => {
      const db = databases.migrated();
      const store = createPostgresReportStore(db);
      assert.equal((await store.channelNames())["booking-com"], "Booking.com");
      assert.equal(await store.yearEndMonth(), 2);
      await createPostgresLedgerStore(db).saveSettings({ yearEndMonth: 6, mainBank: "1000" }, new Date("2026-11-12T08:00:00Z"), ownerId);
      assert.equal(await store.yearEndMonth(), 6);
    });

    it("has the index revenue reads check-outs by", async () => {
      const db = databases.migrated();
      const row = await db.get<{ indexname: string }>("select indexname from pg_indexes where schemaname = 'app' and indexname = 'bookings_by_checked_out'");
      assert.equal(row?.indexname, "bookings_by_checked_out");
    });
  });
}
