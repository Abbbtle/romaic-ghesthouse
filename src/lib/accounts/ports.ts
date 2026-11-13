import type { Role } from "@/lib/kernel/actor";

/**
 * What the account services need from the outside world. The services
 * depend only on these; adapters implement them (Postgres for the stores,
 * Node's crypto for hashing, secrets and authenticator codes), and src/server
 * wires them in.
 *
 * Anything that must be atomic is a single method, so each adapter can make
 * it one transaction: creating the first owner, changing a role without
 * losing the last owner, setting a password together with signing the
 * account out, accepting an authenticator code only once.
 */

export type AccountStatus = "active" | "disabled";

/**
 * How a change to someone's role, access or account went: made; refused
 * because it would leave the team without an active owner; or stale, when
 * the account is gone or its role isn't the one expected (someone changed it
 * first).
 */
export type TeamChangeOutcome = "changed" | "last-owner" | "stale";

/** Someone who can sign in to the dashboard. */
export type Account = {
  id: string;
  /** Lower case: one address is one account however it's typed. */
  email: string;
  name: string;
  role: Role;
  status: AccountStatus;
  passwordHash: string;
  /**
   * The account has a temporary password, set from the team page or by the
   * reset script, and must choose its own before it can use the dashboard.
   */
  mustChangePassword: boolean;
  /** When a temporary password stops working if it hasn't been replaced. */
  temporaryPasswordExpiresAt: Date | null;
  /** When the person proved they receive mail at `email`; password reset links go only to a verified address. */
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastSignedInAt: Date | null;
};

/** An account as the team page shows it: everything but the password hash, plus whether an authenticator is set up. */
export type TeamMember = Omit<Account, "passwordHash"> & { mfaEnabled: boolean };

/** A signed-in browser. Only a hash of its cookie's token is stored. */
export type Session = {
  tokenHash: string;
  accountId: string;
  createdAt: Date;
  /** Moves on as the session is used, never past absoluteExpiresAt. */
  idleExpiresAt: Date;
  /** Fixed when the session starts. */
  absoluteExpiresAt: Date;
  /** When idleExpiresAt last moved. */
  lastExtendedAt: Date;
  /** When this session passed the authenticator step; null until then. */
  mfaVerifiedAt: Date | null;
  /** When the password and code were last re-entered in this session. */
  stepUpAt: Date | null;
  /** A short description of the browser, for the session list. */
  device: string;
};

/** Who's asking, as far as signing in cares: the browser's rate-limit key and a description for the session list. */
export type RequestContext = {
  /** Identifies the browser for rate limits, such as a keyed hash of its IP address. */
  visitorKey: string;
  /** A short description of the browser, such as "Safari on iPhone". */
  device: string;
};

export interface AccountStore {
  /** Whether any account exists: first-run setup is only open while none does. */
  anyExist(): Promise<boolean>;
  findById(id: string): Promise<Account | null>;
  /** The account with this address, given in lower case, or null. */
  findByEmail(email: string): Promise<Account | null>;
  /** Everyone on the team: owners first, then admins, sales and staff, each by name. */
  list(): Promise<TeamMember[]>;
  /**
   * Creates the first account, an owner, but only while there's no account
   * at all: false when someone got there first.
   */
  createFirstOwner(account: Account): Promise<boolean>;
  /** Adds an account; "email-taken" when another account already has the address. */
  create(account: Account): Promise<{ status: "created" } | { status: "email-taken" }>;
  /** Changes a role while it's still `from`, signing the account out everywhere. */
  changeRole(id: string, change: { from: Role; to: Role; at: Date }): Promise<TeamChangeOutcome>;
  /** Disables or re-enables an account while its role is still `role`. Disabling signs it out everywhere. */
  setStatus(id: string, change: { status: AccountStatus; role: Role; at: Date }): Promise<TeamChangeOutcome>;
  /** Removes an account, and with it its sessions, while its role is still `role`. */
  remove(id: string, expected: { role: Role }): Promise<TeamChangeOutcome>;
  /**
   * Sets a new password and signs the account out everywhere except the
   * session whose token hashes to `keepSessionHash`, both at once. A temporary password
   * carries its expiry. False when the account is gone.
   */
  setPassword(
    id: string,
    change: { passwordHash: string; temporary: { expiresAt: Date } | null; at: Date; keepSessionHash: string | null },
  ): Promise<boolean>;
  /** Marks `email` verified, but only while it's still the account's address. */
  markEmailVerified(id: string, change: { email: string; at: Date }): Promise<boolean>;
  recordSignIn(id: string, at: Date): Promise<void>;
}

export interface SessionStore {
  create(session: Session): Promise<void>;
  /** A session with the account it belongs to, or null. Expired sessions are found too: the service decides. */
  findWithAccount(tokenHash: string): Promise<{ session: Session; account: Account; mfaEnabled: boolean } | null>;
  /**
   * Moves a session's idle expiry on, but only if it hasn't moved since
   * `unlessExtendedSince`, so requests arriving together extend it once.
   */
  extend(tokenHash: string, change: { idleExpiresAt: Date; at: Date; unlessExtendedSince: Date }): Promise<boolean>;
  /** Records a re-entered password and code in this session. */
  markSteppedUp(tokenHash: string, at: Date): Promise<boolean>;
  delete(tokenHash: string): Promise<void>;
  /** Signs an account out everywhere, except the session whose token hashes to `keepSessionHash`, when given. */
  deleteForAccount(accountId: string, keepSessionHash?: string | null): Promise<number>;
  /** An account's sessions that haven't ended at `now`, newest first. */
  listForAccount(accountId: string, now: Date): Promise<Session[]>;
  /** Forgets sessions that ended at or before `now`. Returns how many. */
  deleteExpired(now: Date): Promise<number>;
}

/** An account's authenticator, as stored: the secret encrypted, and the last step a code was accepted for. */
export type StoredAuthenticator = {
  secretCiphertext: string;
  /** Null while enrolment waits for the first correct code. */
  confirmedAt: Date | null;
  lastUsedStep: number | null;
};

export interface MfaStore {
  find(accountId: string): Promise<StoredAuthenticator | null>;
  /** Starts (or restarts) enrolment with a new secret. Refused (false) while a confirmed authenticator exists. */
  beginEnrolment(accountId: string, enrolment: { secretCiphertext: string; at: Date }): Promise<boolean>;
  /**
   * Confirms a pending authenticator, recording the step its first code was
   * for, and replaces the account's recovery codes, all at once. False when
   * there's nothing pending.
   */
  confirmEnrolment(accountId: string, confirmation: { at: Date; step: number; recoveryCodeHashes: readonly string[] }): Promise<boolean>;
  /** Accepts a code's step only if it's later than the last one accepted: false for a code used before. */
  recordUse(accountId: string, step: number): Promise<boolean>;
  /** Removes the authenticator and every recovery code (an owner resetting someone, the reset script). */
  remove(accountId: string): Promise<void>;
  /** Replaces the recovery codes. */
  replaceRecoveryCodes(accountId: string, codeHashes: readonly string[], at: Date): Promise<void>;
  /** Uses a recovery code once: false when it doesn't exist or was used. */
  useRecoveryCode(accountId: string, codeHash: string, at: Date): Promise<boolean>;
  countUnusedRecoveryCodes(accountId: string): Promise<number>;
  /** Every stored secret's ciphertext, pending or confirmed, for moving them onto a new key. */
  listSecretCiphertexts(): Promise<{ accountId: string; secretCiphertext: string }[]>;
  /** Swaps a secret's ciphertext for one under a newer key, only if it's still `previous`. */
  replaceSecretCiphertext(accountId: string, change: { previous: string; next: string }): Promise<boolean>;
}

export type AccountTokenPurpose = "password-reset" | "email-verification";

export type AccountToken = {
  tokenHash: string;
  accountId: string;
  purpose: AccountTokenPurpose;
  /** The address the link was sent to. */
  email: string;
  createdAt: Date;
  expiresAt: Date;
};

export interface AccountTokenStore {
  /** Stores a new link, cancelling any earlier unused link for the same account and purpose. */
  issue(token: AccountToken): Promise<void>;
  /**
   * Uses a link once: its account and address when it exists, has this
   * purpose, hasn't expired at `now` and wasn't used; otherwise null.
   */
  consume(tokenHash: string, purpose: AccountTokenPurpose, now: Date): Promise<{ accountId: string; email: string } | null>;
  /** Forgets links that expired at or before `now`. */
  deleteExpired(now: Date): Promise<number>;
}

/** Passwords, hashed with a deliberately slow function and a salt each. */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, passwordHash: string): Promise<boolean>;
}

/**
 * One-way hashing for long random secrets that are looked up but never
 * stored as they are: session tokens, link tokens, the setup token. Never
 * for passwords, nor for recovery codes (see RecoveryCodeHasher).
 */
export interface TokenHasher {
  hash(token: string): string;
  /** Whether `token` hashes to `tokenHash`, compared in constant time. */
  matches(token: string, tokenHash: string): boolean;
}

/**
 * One-way hashing for recovery codes. A code is short (about 49 bits), so a
 * plain hash read from the database could be reversed by trying every code:
 * these are keyed with a secret the database never holds, and tied to the
 * account. Still the same for the same code, so a typed code is found by its
 * hash. Codes are normalised (no hyphen, lower case) before they're hashed.
 */
export interface RecoveryCodeHasher {
  /** The hash to store for a new recovery code, under the current key. */
  hash(accountId: string, code: string): string;
  /** Every hash a stored code may have, one per key still configured, the current key's first. */
  candidateHashes(accountId: string, code: string): string[];
}

/** New secrets, from a cryptographically secure source. */
export interface SecretGenerator {
  /** A session token for a cookie: 43 characters from A–Z, a–z, 0–9, _ and - (see isSessionToken). */
  sessionToken(): string;
  /** A single-use email link token. */
  linkToken(): string;
  /** A temporary password an owner reads out or pastes into WhatsApp: easy to type, hard to guess. */
  temporaryPassword(): string;
  /** A recovery code, used once instead of an authenticator code. */
  recoveryCode(): string;
}

/** Authenticator-app codes (RFC 6238). */
export interface TotpAuthenticator {
  /** A new shared secret, Base32. */
  newSecret(): string;
  /** The step a code is valid for at `at` (allowing a step either side), or null. */
  verify(secretBase32: string, code: string, at: Date): { step: number } | null;
  /** The otpauth:// link an authenticator app adds (scanned as a QR code, or tapped on a phone). */
  provisioningUri(secretBase32: string, accountLabel: string, issuer: string): string;
}

