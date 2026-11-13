import { describeMediaStoreContract } from "./media-store.contract";
import { pgliteTestDatabases } from "./testing/pglite";

// The media store's contract on PGlite. ./media-store.pg.test.ts runs it on a real server.
describeMediaStoreContract(pgliteTestDatabases());
