import { describeStaysStoresContract } from "./stays-stores.contract";
import { postgresTestDatabasesFromEnv } from "./testing/postgres";

// The inventory and booking stores' contract on a real server (npm run test:postgres; see ./testing/postgres.ts).
const databases = postgresTestDatabasesFromEnv();
if (databases) describeStaysStoresContract(databases);
