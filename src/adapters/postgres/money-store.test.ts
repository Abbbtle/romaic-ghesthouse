import { describeMoneyStoreContract } from "./money-store.contract";
import { pgliteTestDatabases } from "./testing/pglite";

// The money store's contract on PGlite. ./money-store.pg.test.ts runs it on a real server.
describeMoneyStoreContract(pgliteTestDatabases());
