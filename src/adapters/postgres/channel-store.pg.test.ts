import { describeChannelStoreContract } from "./channel-store.contract";
import { postgresTestDatabasesFromEnv } from "./testing/postgres";

// The channel store's contract on a real server (npm run test:postgres; see ./testing/postgres.ts).
const databases = postgresTestDatabasesFromEnv();
if (databases) describeChannelStoreContract(databases);
