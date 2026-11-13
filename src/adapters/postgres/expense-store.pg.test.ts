import { describeExpenseStoreContract } from "./expense-store.contract";
import { postgresTestDatabasesFromEnv } from "./testing/postgres";

// The expense store's contract on a real server (npm run test:postgres; see ./testing/postgres.ts).
const databases = postgresTestDatabasesFromEnv();
if (databases) describeExpenseStoreContract(databases);
