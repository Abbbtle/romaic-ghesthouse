import type { AuditRecorder } from "@/lib/kernel/audit";
import type { Clock } from "@/lib/kernel/ports";
import { normalizeEmail } from "./input";
import type { AccountStore, MfaStore, PasswordHasher, SecretGenerator } from "./ports";
import { issueTemporaryPassword } from "./temporary-passwords";

export type RecoveryServiceDependencies = {
  accounts: AccountStore;
  mfa: Pick<MfaStore, "remove">;
  passwords: PasswordHasher;
  secrets: SecretGenerator;
  clock: Clock;
  audit: AuditRecorder;
};

/** A reset names the account as it's stored (its address in lower case), whatever was typed. */
export type RecoveryResult =
  | { status: "reset"; name: string; email: string; role: string; temporaryPassword: string; expiresAt: Date }
  | { status: "not-found" };

/**
 * Break-glass access for when an owner has lost their password, their
 * authenticator and their recovery codes: Weberu runs
 * `npm run admin:reset-password -- --email … --operator "Name" --reason "…"`
 * against the database, on the owner's written request (roles.md, R9).
 * There's no actor, so nothing on the web reaches this; having the database
 * is the permission, which is why the written access policy governs it.
 *
 * It sets a temporary password, removes the authenticator and recovery codes
 * (the owner sets up a new one at next sign-in), signs the account out
 * everywhere, and writes an audit entry naming the operator and reason. The
 * script then emails the account's address that it happened.
 */
export function createRecoveryService(deps: RecoveryServiceDependencies) {
  return {
    async resetAccess(email: string, request: { operator: string; reason: string }): Promise<RecoveryResult> {
      const account = await deps.accounts.findByEmail(normalizeEmail(email));
      if (!account) return { status: "not-found" };
      await deps.mfa.remove(account.id);
      const issued = await issueTemporaryPassword(deps, account.id);
      if (!issued) return { status: "not-found" };
      await deps.audit.record({
        actor: null,
        category: "security",
        action: "break-glass.reset",
        target: { type: "account", id: account.id },
        summary: `Break-glass reset of ${account.name}'s password and authenticator by ${request.operator}`,
        details: { operator: request.operator, reason: request.reason, role: account.role },
      });
      return {
        status: "reset",
        name: account.name,
        email: account.email,
        role: account.role,
        temporaryPassword: issued.password,
        expiresAt: issued.expiresAt,
      };
    },
  };
}

export type RecoveryService = ReturnType<typeof createRecoveryService>;
