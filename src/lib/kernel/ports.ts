/**
 * Ports every core may use. The cores never read the system clock or generate
 * ids themselves, so their rules stay deterministic and testable; adapters in
 * src/adapters implement these and src/server wires them in.
 */

/** The current time. Tests pass a fixed clock. */
export interface Clock {
  now(): Date;
}

/** New record ids (UUID v4 strings in production). */
export interface IdGenerator {
  newId(): string;
}

/** A clock that always reads the given instant. For tests and scripts. */
export function fixedClock(instant: Date | string): Clock {
  const at = new Date(instant);
  return { now: () => new Date(at) };
}

/** Ids "id-1", "id-2", … in order. For tests. */
export function sequentialIds(prefix = "id"): IdGenerator {
  let next = 1;
  return { newId: () => `${prefix}-${next++}` };
}

/**
 * Encryption at rest for single values (src/adapters/crypto/field-encryption.ts).
 * `context` binds a ciphertext to where it belongs, such as "mfa-totp:<account
 * id>": decrypting it anywhere else fails.
 */
export interface FieldCipher {
  encrypt(plaintext: string, context: string): string;
  /** Throws when the value was altered, belongs elsewhere, or its key is gone. */
  decrypt(ciphertext: string, context: string): string;
  /** Whether a value was encrypted with an older key and should be rewritten with the current one. */
  needsReencryption(ciphertext: string): boolean;
}
