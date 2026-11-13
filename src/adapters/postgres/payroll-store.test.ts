import { describePayrollStoreContract } from "./payroll-store.contract";
import { pgliteTestDatabases } from "./testing/pglite";

// The payroll store's contract on PGlite. ./payroll-store.pg.test.ts runs it on a real server.
describePayrollStoreContract(pgliteTestDatabases());
