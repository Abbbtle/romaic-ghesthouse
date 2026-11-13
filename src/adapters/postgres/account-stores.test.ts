import { memoryAccountStores } from "@/lib/accounts/testing/fakes";
import { createPostgresAccountStores } from "./account-stores";
import { describeAccountStoreContract } from "./account-stores.contract";
import { createPostgresAccountTokenStore } from "./account-token-store";
import { createPostgresMfaStore } from "./mfa-store";
import { pgliteTestDatabases } from "./testing/pglite";

const databases = pgliteTestDatabases();

describeAccountStoreContract(
  "PGlite",
  () => {
    const db = databases.migrated();
    return { ...createPostgresAccountStores(db), mfa: createPostgresMfaStore(db), tokens: createPostgresAccountTokenStore(db) };
  },
  { concurrentTransactions: databases.concurrentTransactions },
);

// The in-memory fakes the account services' unit tests use keep the same promises.
describeAccountStoreContract("In-memory fakes", memoryAccountStores, { concurrentTransactions: false });
