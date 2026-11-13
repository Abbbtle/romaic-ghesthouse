import { describePrivacyStoreContract } from "./privacy-store.contract";
import { postgresTestDatabasesFromEnv } from "./testing/postgres";

// The privacy stores' contract on a real server (npm run test:postgres; see ./testing/postgres.ts).
const databases = postgresTestDatabasesFromEnv();
if (databases) describePrivacyStoreContract(databases);
