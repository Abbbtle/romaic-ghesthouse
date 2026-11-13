import { describeBankStoreContract } from "./bank-store.contract";
import { postgresTestDatabasesFromEnv } from "./testing/postgres";

// The bank store's contract on a real server (npm run test:postgres; see ./testing/postgres.ts).
const databases = postgresTestDatabasesFromEnv();
if (databases) describeBankStoreContract(databases);
