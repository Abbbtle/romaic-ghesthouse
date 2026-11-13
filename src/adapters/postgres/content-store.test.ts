import { describeContentStoreContract } from "./content-store.contract";
import { pgliteTestDatabases } from "./testing/pglite";

// The content store's contract on PGlite. ./content-store.pg.test.ts runs it on a real server.
describeContentStoreContract(pgliteTestDatabases());
