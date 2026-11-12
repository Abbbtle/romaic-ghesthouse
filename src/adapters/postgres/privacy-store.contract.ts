import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { testUnit } from "@/lib/inventory/testing/store-contract";
import { testInvoice } from "@/lib/money/testing/store-contract";
import type { RetentionFixtures } from "@/lib/privacy/testing/memory-stores";
import { privacyStoreContract, retentionStoreContract, testBreach, testPolicy, testRequest } from "@/lib/privacy/testing/store-contract";
import type { Database } from "./database";
import { createPostgresInventoryStore } from "./inventory-store";
import { createPostgresMoneyStore } from "./money-store";
import { createPostgresPrivacyStore, createPostgresRetentionStore } from "./privacy-store";
import type { TestDatabases } from "./testing/test-databases";

const unitId = "00000000-0000-4000-8000-00000000a0a1";
const at = new Date("2026-11-12T08:00:00.000Z");
const referenceLetters = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Guests, bookings, payments, booking requests and task photos put straight
 * into a migrated database, the way the reservations, money, booking and
 * tasks stores would leave them (any status, any date), and read back.
 */
async function postgresFixtures(db: Database): Promise<RetentionFixtures> {
  await createPostgresInventoryStore(db).addUnit(testUnit(unitId, "Unit 1"), { maxUnits: 10 });
  let counter = 0;
  const reference = () => {
    counter += 1;
    let value = counter;
    let code = "";
    for (let index = 0; index < 5; index += 1) {
      code = referenceLetters[value % referenceLetters.length] + code;
      value = Math.floor(value / referenceLetters.length);
    }
    return `RG-${code}`;
  };
  return {
    async addGuest(guest, stays) {
      await db.run(
        `insert into app.guests (id, name, phone, email, notes, created_at, updated_at) values (:id, :name, :phone, :email, :notes, :createdAt, :createdAt)`,
        { id: guest.id, name: guest.name, phone: guest.phone, email: guest.email, notes: guest.notes, createdAt: guest.createdAt },
      );
      for (const stay of stays) {
        await db.run(
          `insert into app.bookings (id, reference, guest_id, channel, status, apartment, unit_id, arrive, leave, adults, children, total_cents, deposit_due_cents,
             service_notes, notes, created_at, updated_at, cancelled_at, cancel_reason)
           values (:id, :reference, :guestId, 'phone', :status, 'family-shower', :unitId, :arrive::date, :leave::date, 2, 0, 100000, 0,
             :serviceNotes, :notes, :at, :at, :cancelledAt, :cancelReason)`,
          {
            id: stay.id,
            reference: reference(),
            guestId: guest.id,
            status: stay.status,
            unitId,
            arrive: stay.arrive,
            leave: stay.leave,
            serviceNotes: stay.serviceNotes ?? null,
            notes: stay.notes ?? null,
            at,
            cancelledAt: stay.status === "cancelled" ? at : null,
            cancelReason: stay.status === "cancelled" ? "Plans changed" : null,
          },
        );
        if (stay.paidOn) {
          await db.run(
            `insert into app.payments (id, booking_id, kind, method, amount_cents, received_on, status, receipt_number, created_at)
             values (:id, :bookingId, 'balance', 'eft', 100000, :receivedOn::date, 'received', :receipt, :at)`,
            { id: `00000000-0000-4000-8000-0000000a${String(counter).padStart(4, "0")}`, bookingId: stay.id, receivedOn: stay.paidOn, receipt: `RC-${String(counter).padStart(6, "0")}`, at },
          );
        }
        if (stay.requestId) {
          await db.run(
            `insert into app.booking_requests (id, reference, apartment, apartment_name, arrive, leave, adults, children, name, phone, email,
               consented_at, consent_version, notice_version, status, created_at, decided_at, booking_id)
             values (:id, :reference, 'family-shower', 'Family apartment', :arrive::date, :leave::date, 2, 0, :name, :phone, :email,
               :at, '1', '0.1', 'accepted', :at, :at, :bookingId)`,
            { id: stay.requestId, reference: reference(), arrive: stay.arrive, leave: stay.leave, name: guest.name, phone: guest.phone ?? "+27820000000", email: guest.email, at, bookingId: stay.id },
          );
        }
      }
    },

    async addTask(task) {
      await db.run(
        `insert into app.tasks (id, kind, unit_id, title, status, priority, due_on, created_at, done_at)
         values (:id, 'maintenance', :unitId, 'Fix the dripping tap', :status, 'normal', '2025-01-01', :at, :doneAt)`,
        { id: task.id, unitId, status: task.doneAt ? "done" : "open", at, doneAt: task.doneAt },
      );
      for (const fileId of task.photoIds) {
        await db.run(
          `insert into app.private_files (id, purpose, file_name, content_type, byte_size, sha256, bytes, created_at)
           values (:id, 'task-photo', 'photo.jpg', 'image/jpeg', 3, encode(sha256(decode('ffd8ff', 'hex')), 'hex'), decode('ffd8ff', 'hex'), :at)`,
          { id: fileId, at },
        );
        await db.run("insert into app.task_photos (task_id, file_id) values (:taskId, :fileId)", { taskId: task.id, fileId });
      }
    },

    async guest(id) {
      const row = await db.get<{ name: string; phone: string | null; email: string | null; notes: string | null; anonymised_at: Date | null }>(
        "select name, phone, email, notes, anonymised_at from app.guests where id = :id",
        { id },
      );
      return row ? { name: row.name, phone: row.phone, email: row.email, notes: row.notes, anonymised: row.anonymised_at !== null } : null;
    },

    async bookingNotes(bookingId) {
      const row = await db.get<{ notes: string | null; service_notes: string | null; cancel_reason: string | null }>(
        "select notes, service_notes, cancel_reason from app.bookings where id = :bookingId",
        { bookingId },
      );
      return row ? { notes: row.notes, serviceNotes: row.service_notes, cancelReason: row.cancel_reason } : null;
    },

    async taskPhotos(taskId) {
      const rows = await db.all<{ file_id: string }>("select file_id from app.task_photos where task_id = :taskId order by file_id", { taskId });
      return rows.map((row) => row.file_id);
    },

    async fileExists(fileId) {
      return Boolean(await db.get("select id from app.private_files where id = :fileId", { fileId }));
    },

    async requestExists(requestId) {
      return Boolean(await db.get("select id from app.booking_requests where id = :requestId", { requestId }));
    },
  };
}

/**
 * The Postgres privacy stores: the core's contracts, then what only the
 * database can show (registers keep every entry, policy versions and runs
 * can't be rewritten, and anonymising leaves the money records as they
 * were). Run on PGlite by ./privacy-store.test.ts and on a real server by
 * ./privacy-store.pg.test.ts.
 */
export function describePrivacyStoreContract(databases: TestDatabases): void {
  describe(`${databases.label}: privacy registers`, () => {
    for (const { name, run } of privacyStoreContract) {
      it(name, async () => run(createPostgresPrivacyStore(databases.migrated())));
    }

    it("never deletes a request or a breach, and never rewrites a policy version or a run", async () => {
      const db = databases.migrated();
      const store = createPostgresPrivacyStore(db);
      const request = testRequest();
      const breach = testBreach();
      const policy = testPolicy();
      await store.addRequest(request);
      await store.addBreach(breach);
      await store.addPolicy(policy);
      await store.addRun({ id: "00000000-0000-4000-8000-000000004001", ranAt: at, guestsAnonymised: 0, photosDeleted: 0, skipped: [] });
      await assert.rejects(db.run("delete from app.privacy_requests where id = :id", { id: request.id }));
      await assert.rejects(db.run("truncate app.privacy_requests"));
      await assert.rejects(db.run("delete from app.privacy_breaches where id = :id", { id: breach.id }));
      await assert.rejects(db.run("update app.retention_policies set period = 1 where id = :id", { id: policy.id }));
      await assert.rejects(db.run("delete from app.retention_policies where id = :id", { id: policy.id }));
      await assert.rejects(db.run("update app.retention_runs set photos_deleted = 9"));
      await assert.rejects(db.run("delete from app.retention_runs"));
      assert.ok(await store.request(request.id));
      assert.ok(await store.breach(breach.id));
    });

    it("refuses a refused request without its reason, and a contained breach without its day", async () => {
      const store = createPostgresPrivacyStore(databases.migrated());
      await assert.rejects(store.addRequest(testRequest({ status: "refused", closedOn: "2026-11-12", outcome: null })));
      await assert.rejects(store.addBreach(testBreach({ status: "contained", containedOn: null })));
      await assert.rejects(store.addPolicy(testPolicy({ kind: "guest-records", period: null })), "guest records always have a period");
    });
  });

  describe(`${databases.label}: retention`, () => {
    for (const { name, run } of retentionStoreContract) {
      it(name, async () => {
        const db = databases.migrated();
        await run({ retention: createPostgresRetentionStore(db), fixtures: await postgresFixtures(db) });
      });
    }

    it("keeps an anonymised guest's bookings, payments and invoices as they were, invoices still billed to the name they were issued to", async () => {
      const db = databases.migrated();
      const fixtures = await postgresFixtures(db);
      const guestId = "00000000-0000-4000-8000-00000000c201";
      const bookingId = "00000000-0000-4000-8000-00000000d201";
      await fixtures.addGuest({ id: guestId, name: "Thandi Mokoena", phone: "+27821234567", email: "thandi@example.com", notes: null, createdAt: at }, [
        { id: bookingId, status: "checked-out", arrive: "2026-10-01", leave: "2026-10-03", paidOn: "2026-10-01" },
      ]);
      const money = createPostgresMoneyStore(db);
      await money.issueInvoice(testInvoice(bookingId));
      const outcome = await createPostgresRetentionStore(db).anonymiseGuest(guestId, at);
      assert.equal(outcome.status, "anonymised");
      const booking = await db.get<{ guest_id: string; total_cents: string | number }>("select guest_id, total_cents from app.bookings where id = :bookingId", { bookingId });
      assert.equal(booking?.guest_id, guestId);
      assert.equal(Number(booking?.total_cents), 100_000);
      assert.equal((await money.payments(bookingId)).length, 1);
      assert.equal((await money.invoices(bookingId))[0]?.billedTo.name, "Thandi Mokoena");
    });

    it("takes the guest's first name out of their stay's clean", async () => {
      const db = databases.migrated();
      const fixtures = await postgresFixtures(db);
      const guestId = "00000000-0000-4000-8000-00000000c202";
      const bookingId = "00000000-0000-4000-8000-00000000d202";
      await fixtures.addGuest({ id: guestId, name: "Thandi Mokoena", phone: "+27821234567", email: null, notes: null, createdAt: at }, [
        { id: bookingId, status: "checked-out", arrive: "2026-10-01", leave: "2026-10-03", paidOn: "2026-10-01" },
      ]);
      const taskId = "00000000-0000-4000-8000-00000000e202";
      await db.run(
        `insert into app.tasks (id, kind, unit_id, booking_id, title, priority, status, due_on, created_at)
         values (:taskId, 'housekeeping', :unitId, :bookingId, 'Clean Unit 1 after Thandi', 'normal', 'open', '2026-10-03', :at)`,
        { taskId, unitId, bookingId, at },
      );
      assert.equal((await createPostgresRetentionStore(db).anonymiseGuest(guestId, at)).status, "anonymised");
      assert.equal((await db.get<{ title: string }>("select title from app.tasks where id = :taskId", { taskId }))?.title, "Clean Unit 1");
    });
  });
}
