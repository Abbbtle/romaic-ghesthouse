import { describeContentStoreContract } from "./content-store.contract";
import { postgresTestDatabasesFromEnv } from "./testing/postgres";

// The content store's contract on a real server (npm run test:postgres; see ./testing/postgres.ts).
const databases = postgresTestDatabasesFromEnv();
if (databases) describeContentStoreContract(databases);
