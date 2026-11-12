import { describeReportStoreContract } from "./report-store.contract";
import { pgliteTestDatabases } from "./testing/pglite";

// The report store's contract on PGlite. ./report-store.pg.test.ts runs it on a real server.
describeReportStoreContract(pgliteTestDatabases());
