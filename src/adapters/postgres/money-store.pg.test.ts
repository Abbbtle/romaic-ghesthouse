import { describeMoneyStoreContract } from "./money-store.contract";
import { postgresTestDatabasesFromEnv } from "./testing/postgres";

// The money store's contract on a real server (npm run test:postgres; see ./testing/postgres.ts).
const databases = postgresTestDatabasesFromEnv();
if (databases) describeMoneyStoreContract(databases);
