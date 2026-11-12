import { createPostgresAccountStores } from "./account-stores";
import { describeAccountStoreContract } from "./account-stores.contract";
import { createPostgresAccountTokenStore } from "./account-token-store";
import { createPostgresMfaStore } from "./mfa-store";
import { postgresTestDatabasesFromEnv } from "./testing/postgres";

// The account stores' contract on a real server (npm run test:postgres; see ./testing/postgres.ts).
const databases = postgresTestDatabasesFromEnv();
if (databases) {
  describeAccountStoreContract(
    "Postgres",
    () => {
      const db = databases.migrated();
      return { ...createPostgresAccountStores(db), mfa: createPostgresMfaStore(db), tokens: createPostgresAccountTokenStore(db) };
    },
    {
      concurrentTransactions: databases.concurrentTransactions,
    },
  );
}
