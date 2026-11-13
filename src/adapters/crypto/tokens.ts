import "server-only";
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { SecretGenerator, TokenHasher } from "@/lib/accounts/ports";
import type { IdGenerator } from "@/lib/kernel/ports";

/** New record ids: random UUIDs (v4). */
export const randomIds: IdGenerator = {
  newId: () => randomUUID(),
};


/**
 * SHA-256, hex: what's stored for session tokens (app.sessions.token_hash).
 * It suits long random secrets, which can't be guessed however fast hashing
 * is. Never use it for passwords.
 */
export function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export const sha256TokenHasher: TokenHasher = {
  hash: sha256Hex,
  matches(token, tokenHash) {
    // Both sides are 32-byte digests, so they compare in constant time whatever was typed.
    const actual = Buffer.from(sha256Hex(token), "hex");
    const expected = Buffer.from(tokenHash, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  },
};

// Lower-case letters and digits, without the ones easily mistaken for each other (0/o, 1/l/i).
const temporaryPasswordAlphabet = "abcdefghjkmnpqrstuvwxyz23456789";

/**
 * Secrets from Node's cryptographic random source:
 * - session tokens: 32 random bytes, base64url (43 characters)
 * - temporary passwords: 16 characters in four groups, "kd7m-3xqp-v9tr-2hwz"
 *   (about 79 bits), easy to read out or type from WhatsApp on a phone
 */
export const randomSecrets: SecretGenerator = {
  sessionToken: () => randomBytes(32).toString("base64url"),
  /** Single-use email links (password reset, email verification): 32 random bytes, base64url. */
  linkToken: () => randomBytes(32).toString("base64url"),
  /** Recovery codes: two groups of five, "kd7m3-xqpv9" (about 49 bits), each usable once. */
  recoveryCode: () =>
    Array.from({ length: 2 }, () =>
      Array.from({ length: 5 }, () => temporaryPasswordAlphabet[randomInt(temporaryPasswordAlphabet.length)]).join(""),
    ).join("-"),
  temporaryPassword: () =>
    Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => temporaryPasswordAlphabet[randomInt(temporaryPasswordAlphabet.length)]).join(""),
    ).join("-"),
};
