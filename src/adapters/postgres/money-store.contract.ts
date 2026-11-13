import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { testUnit } from "@/lib/inventory/testing/store-contract";
import { moneyStoreContract, testInvoice, testPayment } from "@/lib/money/testing/store-contract";
import { blockOf, testBooking, testGuest } from "@/lib/reservations/testing/store-contract";
import type { Database } from "./database";
import { createPostgresInventoryStore } from "./inventory-store";
import { createPostgresMoneyStore } from "./money-store";
import { createPostgresReservationStore } from "./reservation-store";
import type { TestDatabases } from "./testing/test-databases";

const bookingId = "00000000-0000-4000-8000-00000000d001";

/** A migrated database holding one booking for the money to belong to. */
async function withBooking(db: Database): Promise<string> {
  await createPostgresInventoryStore(db).addUnit(testUnit("00000000-0000-4000-8000-00000000a0a1", "Unit 1"), { maxUnits: 10 });
  const booking = testBooking(bookingId, "00000000-0000-4000-8000-00000000c001");
  const outcome = await createPostgresReservationStore(db).create({
    newGuest: testGuest("00000000-0000-4000-8000-00000000c001"),
    booking,
    block: blockOf(booking, "00000000-0000-4000-8000-0000000b0001"),
  });
  assert.equal(outcome.status, "created");
  return bookingId;
}

/**
 * The Postgres money store: the core's contract, then what only the
 * database can show (records can't be deleted or rewritten). Run on PGlite
 * by ./money-store.test.ts and on a real server by ./money-store.pg.test.ts.
 */
export function describeMoneyStoreContract(databases: TestDatabases): void {
  describe(`${databases.label}: money`, () => {
    for (const { name, run } of moneyStoreContract) {
      it(name, async () => {
        const db = databases.migrated();
        await run(createPostgresMoneyStore(db), await withBooking(db));
      });
    }

    it("refuses to delete a payment or invoice, or to change what one says", async () => {
      const db = databases.migrated();
      const store = createPostgresMoneyStore(db);
      await withBooking(db);
      const payment = testPayment(bookingId);
      await store.recordPayment(payment);
      const invoice = testInvoice(bookingId);
      await store.issueInvoice(invoice);
      await assert.rejects(db.run("delete from app.payments where id = :id", { id: payment.id }));
      await assert.rejects(db.run("update app.payments set amount_cents = 1 where id = :id", { id: payment.id }));
      await assert.rejects(db.run("delete from app.invoices where id = :id", { id: invoice.id }));
      await assert.rejects(db.run("update app.invoices set total_cents = 1 where id = :id", { id: invoice.id }));
      await assert.rejects(db.run("update app.invoices set vat_cents = 100 where id = :id", { id: invoice.id }));
      assert.equal((await store.payment(payment.id))?.amountCents, payment.amountCents);
    });

    it("refuses a payment for a booking that doesn't exist", async () => {
      const db = databases.migrated();
      await assert.rejects(createPostgresMoneyStore(db).recordPayment(testPayment("00000000-0000-4000-8000-00000000d0ff")));
    });
  });
}
