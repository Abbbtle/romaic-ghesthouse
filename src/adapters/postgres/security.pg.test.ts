import { describeDatabaseSecurityContract } from "./security.contract";
import { postgresTestDatabasesFromEnv } from "./testing/postgres";

// What the database enforces, on a real server (npm run test:postgres; see ./testing/postgres.ts).
const databases = postgresTestDatabasesFromEnv();
if (databases) describeDatabaseSecurityContract(databases);
