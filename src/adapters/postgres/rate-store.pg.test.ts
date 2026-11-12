import { describeRateStoreContract } from "./rate-store.contract";
import { postgresTestDatabasesFromEnv } from "./testing/postgres";

// The rate store's contract on a real server (npm run test:postgres; see ./testing/postgres.ts).
const databases = postgresTestDatabasesFromEnv();
if (databases) describeRateStoreContract(databases);
