import { describeChannelStoreContract } from "./channel-store.contract";
import { pgliteTestDatabases } from "./testing/pglite";

// The channel store's contract on PGlite. ./channel-store.pg.test.ts runs it on a real server.
describeChannelStoreContract(pgliteTestDatabases());
