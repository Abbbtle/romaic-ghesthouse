import { describePostgresContract } from "./postgres.contract";
import { postgresTestDatabasesFromEnv } from "./testing/postgres";

// The Postgres layer's contract on a real server (npm run test:postgres; see ./testing/postgres.ts).
const databases = postgresTestDatabasesFromEnv();
if (databases) describePostgresContract(databases);
