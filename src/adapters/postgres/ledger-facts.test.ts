import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { testUnit } from "@/lib/inventory/testing/store-contract";
import { memoryAuditRecorder } from "@/lib/kernel/audit";
import { createLedgerService } from "@/lib/ledger/ledger-service";
import { testPayment } from "@/lib/money/testing/store-contract";
import { blockOf, testBooking, testGuest } from "@/lib/reservations/testing/store-contract";
import { createPostgresInventoryStore } from "./inventory-store";
import { createPostgresMoneyFacts } from "./ledger-facts";
import { createPostgresLedgerStore } from "./ledger-store";
import { createPostgresMoneyStore } from "./money-store";
import { createPostgresReservationStore } from "./reservation-store";
import { pgliteTestDatabases } from "./testing/pglite";

const bookingId = "00000000-0000-4000-8000-00000000d001";
const guestId = "00000000-0000-4000-8000-00000000c001";
const owner = { id: "00000000-0000-4000-8000-0000000000a1", role: "owner" as const, name: "Owner" };

/**
 * The ledger posting a real booking's money end to end on PGlite: the facts
 * adapter reads the booking, its payments and check-out from the
 * reservations and money tables, and the journals land balanced.
 */
describe("PGlite: the ledger posts bookings' money", () => {
  const databases = pgliteTestDatabases();

  it("posts a deposit, recognises the stay at check-out, and finds the booking in the catch-up", async () => {
    const db = databases.migrated();
    await createPostgresInventoryStore(db).addUnit(testUnit("00000000-0000-4000-8000-00000000a0a1", "Unit 1"), { maxUnits: 10 });
    const reservations = createPostgresReservationStore(db);
    const booking = testBooking(bookingId, guestId);
    assert.equal((await reservations.create({ newGuest: testGuest(guestId), booking, block: blockOf(booking, "00000000-0000-4000-8000-0000000b0001") })).status, "created");
    const money = createPostgresMoneyStore(db);
    await money.recordPayment(testPayment(bookingId, { amountCents: 60_000, receivedOn: "2026-11-12" }));

    let now = new Date("2026-11-12T10:00:00Z");
    const ledger = createLedgerService({
      store: createPostgresLedgerStore(db),
      facts: createPostgresMoneyFacts(db, "Africa/Johannesburg"),
      clock: { now: () => now },
      ids: { newId: () => crypto.randomUUID() },
      audit: memoryAuditRecorder(),
      access: { can: () => true, assertCan: () => {} },
      reportProblem: () => {},
      timeZone: "Africa/Johannesburg",
    });

    assert.deepEqual(await ledger.sync(bookingId), { posted: 1, problems: [] });
    assert.deepEqual(await ledger.catchUp(7), { bookings: 1, posted: 0, problems: 0 }, "already posted");

    await reservations.setStatus({ bookingId, from: ["confirmed"], to: "checked-in", at: new Date("2026-12-10T13:00:00Z"), releaseNights: false });
    await reservations.setStatus({ bookingId, from: ["checked-in"], to: "checked-out", at: new Date("2026-12-13T08:00:00Z"), releaseNights: false });
    now = new Date("2026-12-13T09:00:00Z");
    assert.deepEqual(await ledger.sync(bookingId), { posted: 2, problems: [] }, "income, then the deposit applied");

    const trial = await ledger.trialBalance(owner, "2026-12-31");
    assert.equal(trial.debitCents, trial.creditCents);
    const rows = Object.fromEntries(trial.rows.map((row) => [row.code, row.debitCents - row.creditCents]));
    assert.deepEqual(rows, { "1000": 60_000, "1200": 180_000, "4000": -240_000 });
  });
});
