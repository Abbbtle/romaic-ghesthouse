import { describePrivacyStoreContract } from "./privacy-store.contract";
import { pgliteTestDatabases } from "./testing/pglite";

// The privacy stores' contract on PGlite. ./privacy-store.pg.test.ts runs it on a real server.
describePrivacyStoreContract(pgliteTestDatabases());
