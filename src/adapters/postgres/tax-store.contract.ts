import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lookUp, parameterCodes, isSarsUrl } from "@/lib/tax/parameters";
import { taxStoreContract, testParameter, testReturn } from "@/lib/tax/testing/store-contract";
import type { Database } from "./database";
import { createPostgresTaxStore } from "./tax-store";
import type { TestDatabases } from "./testing/test-databases";

/** A stored proof-of-submission file for returns to point at (a five-byte "PDF"; nothing reads it). */
async function proofFile(db: Database): Promise<string> {
  const id = "00000000-0000-4000-8000-00000000f1f1";
  await db.run(
    `insert into app.private_files (id, purpose, file_name, content_type, byte_size, sha256, bytes, created_at)
     values (:id, 'proof-of-submission', 'proof.pdf', 'application/pdf', 5, :sha, decode('255044462d', 'hex'), now())`,
    { id, sha: "0".repeat(64) },
  );
  return id;
}

/**
 * The Postgres tax store: the core's contract, the seeded parameters, and
 * what only the database can show (parameters and registrations never
 * change, only sars.gov.za can be cited, and reviewed and filed returns keep
 * their rules even past the store). Run on PGlite by ./tax-store.test.ts and
 * on a real server by ./tax-store.pg.test.ts.
 */
export function describeTaxStoreContract(databases: TestDatabases): void {
  describe(`${databases.label}: tax`, () => {
    for (const { name, run } of taxStoreContract) {
      it(name, async () => {
        const db = databases.migrated();
        await run(createPostgresTaxStore(db), { proofFileId: await proofFile(db) });
      });
    }

    it("is seeded with every parameter as checked on sars.gov.za, flagging the ones that couldn't be confirmed", async () => {
      const parameters = await createPostgresTaxStore(databases.migrated()).parameters();
      assert.deepEqual([...new Set(parameters.map((parameter) => parameter.code))].sort(), [...parameterCodes].sort(), "one of each");
      for (const parameter of parameters) {
        assert.ok(isSarsUrl(parameter.sourceUrl), `${parameter.code} cites sars.gov.za`);
        assert.equal(parameter.checkedOn, "2026-11-12", parameter.code);
        assert.equal(parameter.version, 1, parameter.code);
        assert.equal(parameter.status === "verified", parameter.value !== null, parameter.code);
      }
      assert.deepEqual(
        parameters.filter((parameter) => parameter.status === "unverified").map((parameter) => parameter.code).sort(),
        ["turnover.interim-payments", "vat.long-stay-rule"],
      );
      const vat = lookUp(parameters, "vat.standard-rate", "2026-11-12");
      assert.equal(vat.status === "verified" && vat.value, 15);
      const threshold = lookUp(parameters, "vat.compulsory-threshold", "2026-11-12");
      assert.equal(threshold.status === "verified" && threshold.value, 230_000_000);
      for (const code of parameterCodes) {
        const lookup = lookUp(parameters, code, "2026-11-12");
        if (lookup.status === "missing") assert.ok(["turnover.interim-payments", "vat.long-stay-rule"].includes(code), `${code}: ${lookup.message}`);
      }
    });

    it("refuses to change or delete a parameter or registration, and a source that isn't sars.gov.za", async () => {
      const db = databases.migrated();
      const store = createPostgresTaxStore(db);
      const parameter = testParameter();
      await store.addParameter(parameter);
      await assert.rejects(db.run("update app.tax_parameters set value = '16' where id = :id", { id: parameter.id }));
      await assert.rejects(db.run("delete from app.tax_parameters where id = :id", { id: parameter.id }));
      await assert.rejects(store.addParameter(testParameter({ sourceUrl: "https://www.example.com/vat" })));
      await assert.rejects(store.addParameter(testParameter({ sourceUrl: "https://sars.gov.za.example.com/vat" })));
      await store.recordRegistration({
        id: "00000000-0000-4000-8000-00000000e001",
        kind: "paye",
        registered: true,
        effectiveFrom: "2026-03-01",
        referenceLast4: null,
        referenceSealed: null,
        details: {},
        recordedAt: new Date(),
        recordedBy: null,
      });
      await assert.rejects(db.run("update app.tax_registrations set registered = false"));
      await assert.rejects(db.run("delete from app.tax_registrations"));
    });

    it("keeps a reviewed or filed return as it is, whatever calls the database", async () => {
      const db = databases.migrated();
      const store = createPostgresTaxStore(db);
      const proofFileId = await proofFile(db);
      const reviewed = testReturn();
      await store.createReturn(reviewed);
      await store.markReviewed(reviewed.id, new Date(), "00000000-0000-4000-8000-0000000000a1");
      await assert.rejects(db.run("update app.tax_returns set figures = '{}'::jsonb where id = :id", { id: reviewed.id }), "a reviewed return's figures");
      await assert.rejects(db.run("delete from app.tax_returns where id = :id", { id: reviewed.id }), "deleting a reviewed return");
      await store.markFiled(reviewed.id, { filedOn: "2026-11-05", filedAt: new Date(), filedBy: "00000000-0000-4000-8000-0000000000a1", proofFileId, submissionReference: null });
      await assert.rejects(db.run("update app.tax_returns set submission_reference = 'X' where id = :id", { id: reviewed.id }), "changing a filed return");
      await assert.rejects(db.run("delete from app.tax_returns where id = :id", { id: reviewed.id }), "deleting a filed return");
      await assert.rejects(db.run("truncate app.tax_returns"), "truncate");

      const draft = testReturn({ periodStart: "2026-09-01", periodEnd: "2026-09-30" });
      await store.createReturn(draft);
      await assert.rejects(
        db.run("update app.tax_returns set status = 'filed', filed_on = '2026-10-05', filed_at = now(), proof_file_id = :proof where id = :id", { id: draft.id, proof: proofFileId }),
        "draft straight to filed",
      );
      assert.equal((await store.taxReturn(reviewed.id))?.status, "filed");
    });
  });
}
