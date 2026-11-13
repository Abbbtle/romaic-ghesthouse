import { describeDatabaseSecurityContract } from "./security.contract";
import { pgliteTestDatabases } from "./testing/pglite";

describeDatabaseSecurityContract(pgliteTestDatabases());
