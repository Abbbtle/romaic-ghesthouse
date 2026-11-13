import type { FieldCipher } from "@/lib/kernel/ports";
import type { MfaStore } from "./ports";

/**
 * Authenticator secrets at rest: encrypted with DATA_ENCRYPTION_KEY's newest
 * key, bound to their account (so a ciphertext copied onto another account's
 * row doesn't decrypt). Rotating keys means putting a new one in front;
 * reencryptMfaSecrets, run by the daily job, then moves every stored secret
 * onto it, and each one also moves when its code is next accepted. Once the
 * daily job reports none left on the old key, the old key can go.
 */

/** What a secret's encryption is bound to. */
export function mfaSecretContext(accountId: string): string {
  return `mfa-totp:${accountId}`;
}

/**
 * Puts one account's secret under the newest key, unless it's there already
 * or the stored value changed meanwhile (a reset, a new enrolment).
 */
export async function refreshMfaSecret(deps: { mfa: MfaStore; cipher: FieldCipher }, accountId: string, stored: string, secret: string): Promise<boolean> {
  if (!deps.cipher.needsReencryption(stored)) return false;
  return deps.mfa.replaceSecretCiphertext(accountId, { previous: stored, next: deps.cipher.encrypt(secret, mfaSecretContext(accountId)) });
}

/** Moves every stored secret onto the newest key. Returns how many moved, and how many are still on an older key. */
export async function reencryptMfaSecrets(deps: { mfa: MfaStore; cipher: FieldCipher }): Promise<{ reencrypted: number; remaining: number }> {
  let reencrypted = 0;
  let remaining = 0;
  for (const { accountId, secretCiphertext } of await deps.mfa.listSecretCiphertexts()) {
    if (!deps.cipher.needsReencryption(secretCiphertext)) continue;
    const secret = deps.cipher.decrypt(secretCiphertext, mfaSecretContext(accountId));
    if (await refreshMfaSecret(deps, accountId, secretCiphertext, secret)) reencrypted += 1;
    else remaining += 1;
  }
  return { reencrypted, remaining };
}
