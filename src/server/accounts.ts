import "server-only";
import { parseDataKeys } from "@/adapters/crypto/field-encryption";
import { createRecoveryCodeHasher } from "@/adapters/crypto/hmac";
import { scryptPasswordHasher } from "@/adapters/crypto/passwords";
import { randomSecrets, sha256TokenHasher } from "@/adapters/crypto/tokens";
import { rfc6238Authenticator } from "@/adapters/crypto/totp";
import { createPostgresAccountStores } from "@/adapters/postgres/account-stores";
import { createPostgresAccountTokenStore } from "@/adapters/postgres/account-token-store";
import { createPostgresAuditStore } from "@/adapters/postgres/audit-store";
import type { Database } from "@/adapters/postgres/database";
import { createPostgresMfaStore } from "@/adapters/postgres/mfa-store";
import { createAccountService, type AccountService } from "@/lib/accounts/account-service";
import { createEmailLinkService, type EmailLinkService } from "@/lib/accounts/email-link-service";
import { reencryptMfaSecrets } from "@/lib/accounts/mfa-secrets";
import type { RecoveryCodeHasher } from "@/lib/accounts/ports";
import { emailLinkLimit, mfaLimit, setupLimit, signInLimit } from "@/lib/accounts/rate-limits";
import { createRecoveryService, type RecoveryService } from "@/lib/accounts/recovery-service";
import { createSetupService, type SetupService } from "@/lib/accounts/setup-service";
import { createTeamService, type TeamService } from "@/lib/accounts/team-service";
import type { FieldCipher } from "@/lib/kernel/ports";
import { adminPaths } from "./admin-paths";
import { auditRecorder } from "./audit";
import { env } from "./env";
import { clock, database, emailSender, fieldCipher, ids, processSingleton, rateLimiter } from "./infrastructure";

/** The name authenticator apps show, and emails sign with. */
export const businessName = "Romaic Guesthouse";

export type AccountServices = {
  setup: SetupService;
  accounts: AccountService;
  team: TeamService;
  emailLinks: EmailLinkService;
};

const crypto = { passwords: scryptPasswordHasher, tokens: sha256TokenHasher, secrets: randomSecrets };

let services: AccountServices | null = null;

/**
 * The data-key cipher, made on first use rather than with the services: pages
 * that never touch an authenticator secret (sign-in, setup) still work while
 * DATA_ENCRYPTION_KEY is missing, and the authenticator steps fail closed.
 */
const lazyCipher: FieldCipher = {
  encrypt: (plaintext, context) => fieldCipher().encrypt(plaintext, context),
  decrypt: (ciphertext, context) => fieldCipher().decrypt(ciphertext, context),
  needsReencryption: (ciphertext) => fieldCipher().needsReencryption(ciphertext),
};

/**
 * Recovery codes are hashed with keys derived from DATA_ENCRYPTION_KEY (see
 * createRecoveryCodeHasher), made on first use for the same reason as the
 * cipher: only the authenticator steps need the key, and they fail closed
 * without it.
 */
const recoveryCodeHasher = () => processSingleton("recovery-code-hasher", () => createRecoveryCodeHasher(parseDataKeys(env.dataEncryptionKeys())));
const lazyRecoveryCodes: RecoveryCodeHasher = {
  hash: (accountId, code) => recoveryCodeHasher().hash(accountId, code),
  candidateHashes: (accountId, code) => recoveryCodeHasher().candidateHashes(accountId, code),
};

/** Where dashboard links point: its own host when one is set (ADMIN_HOST), otherwise the site's. */
export function dashboardOrigin(): string {
  const host = env.adminHost();
  if (!host) return env.siteUrl();
  return `${env.isProduction() ? "https" : "http"}://${host}`;
}

/**
 * The account services over the app's database: scrypt for passwords,
 * SHA-256 for tokens, RFC 6238 authenticator codes, secrets encrypted and
 * recovery codes keyed with the data key, rate limits counted in Postgres,
 * every change recorded in the audit log. Made on first use, never while
 * building, and kept per module: a development reload rebuilds them with
 * the edited code.
 */
export function accountServices(): AccountServices {
  services ??= createAccountServices();
  return services;
}

function createAccountServices(): AccountServices {
  const db = database();
  const stores = createPostgresAccountStores(db);
  const mfa = createPostgresMfaStore(db);
  const audit = auditRecorder();
  return {
    setup: createSetupService({
      ...stores,
      ...crypto,
      ids,
      clock,
      audit,
      limiter: rateLimiter(setupLimit),
      // Production needs ADMIN_SETUP_TOKEN, so a stranger can't claim a freshly deployed site.
      setup: { token: env.adminSetupToken(), openWithoutToken: !env.isProduction() },
    }),
    accounts: createAccountService({
      ...stores,
      ...crypto,
      recoveryCodes: lazyRecoveryCodes,
      mfa,
      totp: rfc6238Authenticator,
      cipher: lazyCipher,
      clock,
      audit,
      signInLimiter: rateLimiter(signInLimit),
      mfaLimiter: rateLimiter(mfaLimit),
      issuer: businessName,
    }),
    team: createTeamService({ ...stores, ...crypto, mfa, ids, clock, audit }),
    emailLinks: createEmailLinkService({
      accounts: stores.accounts,
      tokens: createPostgresAccountTokenStore(db),
      hasher: crypto.tokens,
      secrets: crypto.secrets,
      passwords: crypto.passwords,
      email: emailSender(),
      clock,
      limiter: rateLimiter(emailLinkLimit),
      audit,
      links: {
        resetPassword: (token) => `${dashboardOrigin()}${adminPaths.resetPassword}?token=${encodeURIComponent(token)}`,
        verifyEmail: (token) => `${dashboardOrigin()}${adminPaths.verifyEmail}?token=${encodeURIComponent(token)}`,
      },
      businessName,
    }),
  };
}

/** Moves stored authenticator secrets onto DATA_ENCRYPTION_KEY's newest key (the daily job; see src/lib/accounts/mfa-secrets.ts). */
export function reencryptStoredSecrets(): Promise<{ reencrypted: number; remaining: number }> {
  return reencryptMfaSecrets({ mfa: createPostgresMfaStore(database()), cipher: lazyCipher });
}

/** Break-glass access resets over a database a script opened (scripts/reset-password.ts). */
export function recoveryService(db: Database): RecoveryService {
  return createRecoveryService({
    ...createPostgresAccountStores(db),
    ...crypto,
    mfa: createPostgresMfaStore(db),
    clock,
    audit: createPostgresAuditStore(db, { clock, ids }),
  });
}
