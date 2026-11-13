import { describeTaskStoreContract } from "./task-store.contract";
import { pgliteTestDatabases } from "./testing/pglite";

// The task store's contract on PGlite. ./task-store.pg.test.ts runs it on a real server.
describeTaskStoreContract(pgliteTestDatabases());
