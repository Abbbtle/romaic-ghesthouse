import "server-only";
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import type { PasswordHasher } from "@/lib/accounts/ports";

// OWASP Password Storage Cheat Sheet minimum for scrypt: N = 2^17, r = 8, p = 1 (128 MB per hash).
// Hashes made with lower parameters (the template used N = 2^14) still verify: each stored hash
// carries its own parameters.
export const scryptParameters = { N: 131072, r: 8, p: 1, keyLength: 64, saltLength: 16 } as const;

// Room for N = 2^17, r = 8 (128 MB) plus scrypt's working overhead.
const maxmem = 192 * 1024 * 1024;

function derive(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // NFKC, so the same password typed on two keyboards (composed or decomposed accents) is one password.
    scrypt(password.normalize("NFKC"), salt, keyLength, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

/**
 * Passwords hashed with scrypt, a deliberately slow, memory-hard function,
 * and a random salt each. Stored as "scrypt$N$r$p$salt$hash" (base64url), so
 * the parameters can be raised later without breaking existing passwords.
 */
export const scryptPasswordHasher: PasswordHasher = {
  async hash(password) {
    const { N, r, p, keyLength, saltLength } = scryptParameters;
    const salt = randomBytes(saltLength);
    const key = await derive(password, salt, keyLength, { N, r, p, maxmem });
    return ["scrypt", N, r, p, salt.toString("base64url"), key.toString("base64url")].join("$");
  },

  async verify(password, passwordHash) {
    const [scheme, n, r, p, salt, expected] = passwordHash.split("$");
    if (scheme !== "scrypt" || !salt || !expected) return false;
    const expectedKey = Buffer.from(expected, "base64url");
    try {
      const key = await derive(password, Buffer.from(salt, "base64url"), expectedKey.length, {
        N: Number(n),
        r: Number(r),
        p: Number(p),
        maxmem,
      });
      return key.length === expectedKey.length && timingSafeEqual(key, expectedKey);
    } catch {
      // A malformed stored hash never matches.
      return false;
    }
  },
};
