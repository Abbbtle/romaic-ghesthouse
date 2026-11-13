import { describeMediaStoreContract } from "./media-store.contract";
import { postgresTestDatabasesFromEnv } from "./testing/postgres";

// The media store's contract on a real server (npm run test:postgres; see ./testing/postgres.ts).
const databases = postgresTestDatabasesFromEnv();
if (databases) describeMediaStoreContract(databases);
