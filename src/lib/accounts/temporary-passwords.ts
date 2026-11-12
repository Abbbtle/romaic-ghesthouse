import type { Clock } from "@/lib/kernel/ports";
import type { AccountStore, PasswordHasher, SecretGenerator } from "./ports";

/**
 * Temporary passwords, the way back in for sales and staff (who may have no
 * email): someone allowed to manage their role gives them one, shares it
 * privately, and the account must choose its own password at its next
 * sign-in. Shown once and never stored, only its hash. It stops working
 * after 72 hours if unused (roles.md, R8). An authenticator, if set up,
 * stays: a reset never removes it.
 */
export const temporaryPasswordLifetimeMs = 72 * 60 * 60 * 1000;

export type TemporaryPasswordDependencies = {
  accounts: Pick<AccountStore, "setPassword">;
  passwords: Pick<PasswordHasher, "hash">;
  secrets: Pick<SecretGenerator, "temporaryPassword">;
  clock: Clock;
};

/**
 * Gives an account a new temporary password and signs it out everywhere.
 * Returns the password to share, or null when the account no longer exists.
 */
export async function issueTemporaryPassword(deps: TemporaryPasswordDependencies, accountId: string): Promise<{ password: string; expiresAt: Date } | null> {
  const password = deps.secrets.temporaryPassword();
  const now = deps.clock.now();
  const expiresAt = new Date(now.getTime() + temporaryPasswordLifetimeMs);
  const changed = await deps.accounts.setPassword(accountId, {
    passwordHash: await deps.passwords.hash(password),
    temporary: { expiresAt },
    at: now,
    keepSessionHash: null,
  });
  return changed ? { password, expiresAt } : null;
}
