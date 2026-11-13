import { describeLedgerStoreContract } from "./ledger-store.contract";
import { postgresTestDatabasesFromEnv } from "./testing/postgres";

// The ledger store's contract on a real server (npm run test:postgres; see ./testing/postgres.ts).
const databases = postgresTestDatabasesFromEnv();
if (databases) describeLedgerStoreContract(databases);
