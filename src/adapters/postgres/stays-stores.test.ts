import { describeStaysStoresContract } from "./stays-stores.contract";
import { pgliteTestDatabases } from "./testing/pglite";

// The inventory and booking stores' contract on PGlite. ./stays-stores.pg.test.ts runs it on a real server.
describeStaysStoresContract(pgliteTestDatabases());
