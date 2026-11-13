import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { TotpAuthenticator } from "@/lib/accounts/ports";

/**
 * Time-based one-time passwords (RFC 6238 over RFC 4226 HOTP), the codes
 * authenticator apps show: HMAC-SHA1, 6 digits, 30-second steps, the
 * parameters every app supports. Secrets are 20 random bytes (160 bits, as
 * RFC 4226 recommends), shared with the app as Base32 (RFC 4648).
 *
 * A code is accepted for the current step and one step either side, to allow
 * for a phone's clock being a little out. The step it matched is returned so
 * the caller can refuse it a second time (RFC 6238 §5.2).
 */

export const totpParameters = { digits: 6, periodSeconds: 30, algorithm: "SHA1", window: 1 } as const;

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += base32Alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += base32Alphabet[(value << (5 - bits)) & 31];
  return output;
}

/** Base32 to bytes, ignoring spaces, hyphens, padding and case; null for anything else. */
export function base32Decode(text: string): Uint8Array | null {
  const clean = text.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = base32Alphabet.indexOf(char);
    if (index === -1) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(bytes);
}

/** RFC 4226 HOTP for one counter value, as a zero-padded string. */
export function hotp(secret: Uint8Array, counter: number, digits: number = totpParameters.digits): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(message).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) | ((digest[offset + 1]! & 0xff) << 16) | ((digest[offset + 2]! & 0xff) << 8) | (digest[offset + 3]! & 0xff);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/** The 30-second step an instant falls in. */
export function totpStep(at: Date): number {
  return Math.floor(at.getTime() / 1000 / totpParameters.periodSeconds);
}

/** The code an authenticator shows at an instant. */
export function totpAt(secret: Uint8Array, at: Date): string {
  return hotp(secret, totpStep(at));
}

function sameCode(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const rfc6238Authenticator: TotpAuthenticator = {
  newSecret: () => base32Encode(randomBytes(20)),

  verify(secretBase32, code, at) {
    const secret = base32Decode(secretBase32);
    const typed = code.replace(/\s/g, "");
    if (!secret || secret.length === 0 || !/^\d{6}$/.test(typed)) return null;
    const now = totpStep(at);
    // Check every candidate step, so the time taken doesn't reveal which one matched.
    let matched: number | null = null;
    for (let step = now - totpParameters.window; step <= now + totpParameters.window; step++) {
      if (sameCode(hotp(secret, step), typed) && matched === null) matched = step;
    }
    return matched === null ? null : { step: matched };
  },

  provisioningUri(secretBase32, accountLabel, issuer) {
    const label = encodeURIComponent(`${issuer}:${accountLabel}`);
    const query = new URLSearchParams({
      secret: secretBase32,
      issuer,
      algorithm: totpParameters.algorithm,
      digits: String(totpParameters.digits),
      period: String(totpParameters.periodSeconds),
    });
    return `otpauth://totp/${label}?${query}`;
  },
};
