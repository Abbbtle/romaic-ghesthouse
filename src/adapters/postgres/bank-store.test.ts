import { describeBankStoreContract } from "./bank-store.contract";
import { pgliteTestDatabases } from "./testing/pglite";

// The bank store's contract on PGlite. ./bank-store.pg.test.ts runs it on a real server.
describeBankStoreContract(pgliteTestDatabases());
