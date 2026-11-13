import { describeLedgerStoreContract } from "./ledger-store.contract";
import { pgliteTestDatabases } from "./testing/pglite";

// The ledger store's contract on PGlite. ./ledger-store.pg.test.ts runs it on a real server.
describeLedgerStoreContract(pgliteTestDatabases());
