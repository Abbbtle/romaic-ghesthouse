import { describeTaxStoreContract } from "./tax-store.contract";
import { pgliteTestDatabases } from "./testing/pglite";

// The tax store's contract on PGlite. ./tax-store.pg.test.ts runs it on a real server.
describeTaxStoreContract(pgliteTestDatabases());
