import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC-SHA256 with a secret every server shares (VISITOR_KEY_SECRET in
 * production): keys that count visitors without keeping their IP
 * addresses, and short signed tokens.
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
