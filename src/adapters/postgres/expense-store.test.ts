import { describeExpenseStoreContract } from "./expense-store.contract";
import { pgliteTestDatabases } from "./testing/pglite";

// The expense store's contract on PGlite. ./expense-store.pg.test.ts runs it on a real server.
describeExpenseStoreContract(pgliteTestDatabases());
