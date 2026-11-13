import { describePostgresContract } from "./postgres.contract";
import { pgliteTestDatabases } from "./testing/pglite";

// The Postgres layer's contract on PGlite. ./postgres.pg.test.ts runs it on a real server.
describePostgresContract(pgliteTestDatabases());
