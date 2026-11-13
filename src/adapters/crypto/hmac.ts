import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { RecoveryCodeHasher } from "@/lib/accounts/ports";

/**
 * HMAC-SHA256 with a secret every server shares (VISITOR_KEY_SECRET in
 * production): keys that count visitors without keeping their IP
 * addresses, and short signed tokens. Recovery codes are hashed with keys
 * derived from DATA_ENCRYPTION_KEY instead (createRecoveryCodeHasher).
 */

export type HmacSecret = string | Uint8Array;

/** Rate-limit keys for visitors, from their IP addresses. */
export type VisitorKeys = {
  /**
   * The key for a visitor's address: 32 characters that can't be turned back
   * into it. A request that carried no address gets the key of "unknown", so
   * such visitors share one limit.
   */
  keyFor(address: string | null): string;
};

export function createVisitorKeys(secret: HmacSecret): VisitorKeys {
  return {
    keyFor: (address) =>
      createHmac("sha256", secret)
        .update(address ?? "unknown")
        .digest("base64url")
        .slice(0, 32),
  };
}

/**
 * A 32-byte key for one `purpose`, such as "audit-chain", derived from
 * `secret` (a data key, say), so the secret itself is only ever used for
 * what it was made for and a key derived for one purpose is useless for
 * another.
 */
export function derivePurposeKey(secret: HmacSecret, purpose: string): Buffer {
  return createHmac("sha256", secret).update(`romaic-key:${purpose}`).digest();
}

/**
 * Short signed tokens: a payload and its HMAC, so the server can hand a value
 * to a browser and later trust it came back unchanged (the booking form signs
 * the time it was shown with one). The payload is readable by anyone holding
 * the token: never put a secret or personal data in it.
 */
export type TokenSigner = {
  /** "<payload, base64url>.<signature>". */
  sign(payload: string): string;
  /** The payload of a token this signer made, or null for anything else. */
  verify(token: string): string | null;
};

/**
 * A signer whose key is derived from `secret` for one `purpose`, such as
 * "booking-form", so a token made for one purpose never passes for another.
 */
export function createTokenSigner(secret: HmacSecret, purpose: string): TokenSigner {
  const key = createHmac("sha256", secret).update(`romaic-token:${purpose}`).digest();
  const signatureOf = (encodedPayload: string) => createHmac("sha256", key).update(encodedPayload).digest();
  return {
    sign(payload) {
      const encoded = Buffer.from(payload, "utf8").toString("base64url");
      return `${encoded}.${signatureOf(encoded).toString("base64url")}`;
    },
    verify(token) {
      const parts = token.split(".");
      const [encoded, signature] = parts;
      if (parts.length !== 2 || !encoded || !signature) return null;
      const expected = signatureOf(encoded);
      const actual = Buffer.from(signature, "base64url");
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
      return Buffer.from(encoded, "base64url").toString("utf8");
    },
  };
}

/**
 * Recovery codes hashed for app.mfa_recovery_codes: HMAC-SHA256 of the
 * account id and the code, under a key derived for this purpose alone from
 * each of DATA_ENCRYPTION_KEY's keys. The database never holds the key, so a
 * leaked copy of the database can't be searched for codes the way a plain
 * hash of a 10-character code can; and the account id in the HMAC means a
 * code (or a row copied between accounts) only ever matches its own account.
 *
 * Stored as "hmac-sha256.<key id>.<HMAC, base64url>". New codes use the first
 * (newest) key; a code made under any key still listed matches too, so
 * rotating the data key the documented way (new key in front, old one kept)
 * leaves recovery codes working.
 */
export function createRecoveryCodeHasher(keys: readonly { id: string; key: HmacSecret }[]): RecoveryCodeHasher {
  if (keys.length === 0) throw new Error("No key to hash recovery codes with.");
  const derived = keys.map(({ id, key }) => ({ id, key: createHmac("sha256", key).update("romaic-recovery-code").digest() }));
  const hashWith = ({ id, key }: { id: string; key: Buffer }, accountId: string, code: string) =>
    `hmac-sha256.${id}.${createHmac("sha256", key).update(`${accountId}:${code}`).digest("base64url")}`;
  return {
    hash: (accountId, code) => hashWith(derived[0]!, accountId, code),
    candidateHashes: (accountId, code) => derived.map((key) => hashWith(key, accountId, code)),
  };
}
