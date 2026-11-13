import { describeTaxStoreContract } from "./tax-store.contract";
import { postgresTestDatabasesFromEnv } from "./testing/postgres";

// The tax store's contract on a real server (npm run test:postgres; see ./testing/postgres.ts).
const databases = postgresTestDatabasesFromEnv();
if (databases) describeTaxStoreContract(databases);
