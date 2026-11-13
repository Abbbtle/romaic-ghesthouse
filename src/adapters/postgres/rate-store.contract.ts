import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rateStoreContract, testSeason } from "@/lib/rates/testing/store-contract";
import { ExclusionViolationError } from "./errors";
import { createPostgresRateStore } from "./rate-store";
import type { TestDatabases } from "./testing/test-databases";

/**
 * What the Postgres rate store promises: the core's own contract, then what
 * only Postgres can show, such as seasons kept apart even when the
 * application is bypassed. Run on PGlite by ./rate-store.test.ts and on a
 * real server by ./rate-store.pg.test.ts.
 */
export function describeRateStoreContract(databases: TestDatabases): void {
  describe(`${databases.label}: rates`, () => {
    for (const { name, run } of rateStoreContract) {
      it(name, async () => run(createPostgresRateStore(databases.migrated())));
    }

    it("refuses two seasons sharing a night in the database itself", async () => {
      const db = databases.migrated();
      await createPostgresRateStore(db).addSeason(testSeason("00000000-0000-4000-8000-00000000e001", "2026-12-15", "2027-01-06"));
      await assert.rejects(
        db.run("insert into app.seasons (id, name, starts_on, ends_before, updated_at) values (:id, 'Clash', '2027-01-05', '2027-01-08', now())", {
          id: "00000000-0000-4000-8000-00000000e002",
        }),
        (error) => {
          assert.ok(error instanceof ExclusionViolationError);
          assert.equal(error.constraint, "seasons_no_overlap");
          return true;
        },
      );
    });

    it("removes a season's prices with it", async () => {
      const db = databases.migrated();
      const store = createPostgresRateStore(db);
      await store.addSeason(testSeason("00000000-0000-4000-8000-00000000e001", "2026-12-15", "2027-01-06"));
      await store.removeSeason("00000000-0000-4000-8000-00000000e001");
      assert.deepEqual(await db.all("select season_id from app.season_rates"), []);
    });
  });
}
