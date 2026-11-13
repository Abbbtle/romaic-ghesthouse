import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { FieldCipher } from "@/lib/kernel/ports";

/**
 * Encryption at rest for individual values (authenticator secrets now;
 * channel iCal URLs, API keys and any guest ID numbers later): AES-256-GCM
 * with a random 96-bit nonce per value and a 128-bit tag.
 *
 * Keys come from DATA_ENCRYPTION_KEY as "id:base64key" pairs separated by
 * commas, newest first: "k2:…,k1:…". New values use the first key; any listed
 * key decrypts, so a key can be rotated by adding a new one in front,
 * re-encrypting, then dropping the old one. Each key is 32 random bytes.
 *
 * Every value is bound to a context (the AAD), such as "mfa-totp:<account
 * id>", so a ciphertext copied into another row or column fails to decrypt.
 *
 * Stored format: "v1.<key id>.<nonce>.<ciphertext>.<tag>", base64url parts.
 */

export type DataKey = { id: string; key: Buffer };

export class FieldEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FieldEncryptionError";
  }
}

const keyIdPattern = /^[A-Za-z0-9_-]{1,32}$/;

/** Reads DATA_ENCRYPTION_KEY's value. Throws, naming the problem but never the key, when it's malformed. */
export function parseDataKeys(value: string): DataKey[] {
  const keys = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf(":");
      const id = separator > 0 ? part.slice(0, separator) : "";
      const key = Buffer.from(part.slice(separator + 1), "base64");
      if (!keyIdPattern.test(id)) throw new FieldEncryptionError('Each DATA_ENCRYPTION_KEY entry must look like "k1:<base64 key>".');
      if (key.length !== 32) throw new FieldEncryptionError(`DATA_ENCRYPTION_KEY "${id}" must be 32 bytes, base64-encoded.`);
      return { id, key };
    });
  if (keys.length === 0) throw new FieldEncryptionError("DATA_ENCRYPTION_KEY has no keys.");
  if (new Set(keys.map((key) => key.id)).size !== keys.length) throw new FieldEncryptionError("DATA_ENCRYPTION_KEY lists the same key id twice.");
  return keys;
}

export function createFieldCipher(keys: readonly DataKey[]): FieldCipher {
  const current = keys[0];
  if (!current) throw new FieldEncryptionError("No data encryption key.");
  const byId = new Map(keys.map((key) => [key.id, key.key]));

  return {
    encrypt(plaintext, context) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", current.key, nonce);
      cipher.setAAD(Buffer.from(context, "utf8"));
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return ["v1", current.id, nonce.toString("base64url"), ciphertext.toString("base64url"), tag.toString("base64url")].join(".");
    },

    decrypt(stored, context) {
      const [version, keyId, nonce, ciphertext, tag, ...rest] = stored.split(".");
      if (version !== "v1" || !keyId || nonce === undefined || ciphertext === undefined || !tag || rest.length > 0) {
        throw new FieldEncryptionError("That value isn't in the encrypted format.");
      }
      const key = byId.get(keyId);
      if (!key) throw new FieldEncryptionError(`The key "${keyId}" this value was encrypted with is no longer configured.`);
      const tagBytes = Buffer.from(tag, "base64url");
      // A full 16-byte tag only: Node would otherwise accept a truncated one.
      if (tagBytes.length !== 16) throw new FieldEncryptionError("That value couldn't be decrypted: it was changed, or belongs to another record.");
      try {
        const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(nonce, "base64url"), { authTagLength: 16 });
        decipher.setAAD(Buffer.from(context, "utf8"));
        decipher.setAuthTag(tagBytes);
        return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
      } catch {
        throw new FieldEncryptionError("That value couldn't be decrypted: it was changed, or belongs to another record.");
      }
    },

    needsReencryption(stored) {
      return stored.split(".")[1] !== current.id;
    },
  };
}

/** A fresh key in DATA_ENCRYPTION_KEY's format, for setup instructions and tests. */
export function newDataKeyEntry(id: string): string {
  return `${id}:${randomBytes(32).toString("base64")}`;
}
