import { describeRateStoreContract } from "./rate-store.contract";
import { pgliteTestDatabases } from "./testing/pglite";

// The rate store's contract on PGlite. ./rate-store.pg.test.ts runs it on a real server.
describeRateStoreContract(pgliteTestDatabases());
