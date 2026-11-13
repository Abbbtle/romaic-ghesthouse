import { describeReportStoreContract } from "./report-store.contract";
import { postgresTestDatabasesFromEnv } from "./testing/postgres";

// The report store's contract on a real server (npm run test:postgres; see ./testing/postgres.ts).
const databases = postgresTestDatabasesFromEnv();
if (databases) describeReportStoreContract(databases);
