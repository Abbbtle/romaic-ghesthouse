import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { payrollStoreContract, testEmployee, testRun } from "@/lib/tax/testing/store-contract";
import { createPostgresPayrollStore } from "./payroll-store";
import type { TestDatabases } from "./testing/test-databases";

/**
 * The Postgres payroll store: the core's contract, then what only the
 * database can show (a run can't be deleted or rewritten, only voided once;
 * net pay always adds up; employees are never deleted). Run on PGlite by
 * ./payroll-store.test.ts and on a real server by ./payroll-store.pg.test.ts.
 */
export function describePayrollStoreContract(databases: TestDatabases): void {
  describe(`${databases.label}: payroll`, () => {
    for (const { name, run } of payrollStoreContract) {
      it(name, async () => run(createPostgresPayrollStore(databases.migrated())));
    }

    it("refuses to delete or rewrite a run or an employee, and net pay that doesn't add up", async () => {
      const db = databases.migrated();
      const store = createPostgresPayrollStore(db);
      const employee = testEmployee();
      await store.addEmployee(employee);
      const run = testRun(employee.id);
      await store.recordRun(run);
      await assert.rejects(db.run("delete from app.payroll_runs where id = :id", { id: run.id }), "delete a run");
      await assert.rejects(db.run("update app.payroll_runs set gross_cents = 1, net_cents = 1 - paye_cents - uif_employee_cents where id = :id", { id: run.id }), "rewrite a run");
      await assert.rejects(db.run("delete from app.employees where id = :id", { id: employee.id }), "delete an employee");
      await assert.rejects(db.run("truncate app.payroll_runs"), "truncate");
      await assert.rejects(store.recordRun(testRun(employee.id, { period: "2026-09", netCents: 1 })), "net that doesn't add up");
      await store.voidRun(run.id, new Date(), "Wrong month", null);
      await assert.rejects(db.run("update app.payroll_runs set void_reason = 'Other' where id = :id", { id: run.id }), "change a void");
      assert.equal((await store.run(run.id))?.voidReason, "Wrong month");
    });
  });
}
