import { describePayrollStoreContract } from "./payroll-store.contract";
import { postgresTestDatabasesFromEnv } from "./testing/postgres";

// The payroll store's contract on a real server (npm run test:postgres; see ./testing/postgres.ts).
const databases = postgresTestDatabasesFromEnv();
if (databases) describePayrollStoreContract(databases);
