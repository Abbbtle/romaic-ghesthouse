import type { Clock, FieldCipher, IdGenerator } from "@/lib/kernel/ports";
import type { RateLimiter } from "@/lib/kernel/rate-limit";
import type {
  Account,
  AccountStore,
  AccountToken,
  AccountTokenStore,
  MfaStore,
  PasswordHasher,
  RecoveryCodeHasher,
  SecretGenerator,
  Session,
  SessionStore,
  StoredAuthenticator,
  TeamMember,
  TokenHasher,
  TotpAuthenticator,
} from "../ports";

/**
 * Stand-ins for the account services' ports, for tests. The in-memory stores
 * keep the same promises as the Postgres ones: the store contract in
 * src/adapters/postgres/account-stores.contract.ts runs against both.
 */

/** A clock a test can set and move on. */
export function movableClock(start = "2026-10-20T08:00:00.000Z"): Clock & { set(iso: string): void; advance(ms: number): void } {
  let now = new Date(start).getTime();
  return {
    now: () => new Date(now),
    set: (iso) => {
      now = new Date(iso).getTime();
    },
    advance: (ms) => {
      now += ms;
    },
  };
}

/** UUID-shaped ids in order: …-000000000001, …-000000000002, … */
export function uuidIds(): IdGenerator {
  let next = 0;
  return { newId: () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}` };
}

/** Fast stand-in for scrypt (tested on its own in src/adapters/crypto). */
export const plainPasswords: PasswordHasher = {
  hash: async (password) => `plain:${password}`,
  verify: async (password, passwordHash) => passwordHash === `plain:${password}`,
};

export const plainTokens: TokenHasher = {
  hash: (token) => `hashed:${token}`,
  matches: (token, tokenHash) => tokenHash === `hashed:${token}`,
};

/**
 * A stand-in for the keyed recovery-code hash (the real one is tested in
 * src/adapters/crypto): each hash names its key and account. New codes use
 * the first key; a code stored under any listed key still matches.
 */
export function keyedRecoveryCodes(keyIds: readonly string[] = ["k1"]): RecoveryCodeHasher {
  const hashWith = (keyId: string, accountId: string, code: string) => `keyed(${keyId}):${accountId}:${code}`;
  return {
    hash: (accountId, code) => hashWith(keyIds[0]!, accountId, code),
    candidateHashes: (accountId, code) => keyIds.map((keyId) => hashWith(keyId, accountId, code)),
  };
}

/** Tokens shaped like real ones, temporary passwords long enough to pass the rules, and recovery codes, in order. */
export function sequentialSecrets(): SecretGenerator {
  let next = 0;
  return {
    sessionToken: () => `token${String(++next).padStart(38, "0")}`,
    linkToken: () => `link${String(++next).padStart(39, "0")}`,
    temporaryPassword: () => `temporary-password-${++next}`,
    recoveryCode: () => {
      const digits = String(++next).padStart(5, "0");
      return `rcode-${digits}`;
    },
  };
}

/**
 * An authenticator stand-in: the valid code at any moment is the secret's
 * last six characters' step, so tests pick codes without real TOTP maths.
 * `codeAt(secret, at)` gives the code a phone would show.
 */
export function fakeTotp(): TotpAuthenticator & { codeAt(secret: string, at: Date): string } {
  let next = 0;
  const step = (at: Date) => Math.floor(at.getTime() / 30000);
  const codeAt = (secret: string, at: Date) => String((Number(secret.replace(/\D/g, "").slice(-3) || "0") * 1000 + step(at)) % 1_000_000).padStart(6, "0");
  return {
    codeAt,
    newSecret: () => `SECRET${String(++next).padStart(3, "0")}`,
    verify(secret, code, at) {
      for (const delta of [-1, 0, 1]) {
        const moment = new Date(at.getTime() + delta * 30000);
        if (codeAt(secret, moment) === code.trim()) return { step: step(moment) };
      }
      return null;
    },
    provisioningUri: (secret, label, issuer) => `otpauth://totp/${issuer}:${label}?secret=${secret}`,
  };
}

/** A cipher that wraps values visibly and checks their context, standing in for AES-GCM. */
export const plainCipher: FieldCipher = {
  encrypt: (plaintext, context) => `enc(${context}):${plaintext}`,
  decrypt: (ciphertext, context) => {
    const prefix = `enc(${context}):`;
    if (!ciphertext.startsWith(prefix)) throw new Error("That value belongs to another record.");
    return ciphertext.slice(prefix.length);
  },
  needsReencryption: () => false,
};

export const unlimited: RateLimiter = { tryConsume: async () => true, reset: async () => {} };

export const exhausted: RateLimiter = { tryConsume: async () => false, reset: async () => {} };

/** A limiter that allows `maxAttempts` per key, and remembers which keys it saw and reset. */
export function countingLimiter(maxAttempts: number): RateLimiter & { attempts: Map<string, number>; resets: string[] } {
  const attempts = new Map<string, number>();
  const resets: string[] = [];
  return {
    attempts,
    resets,
    async tryConsume(key) {
      const count = (attempts.get(key) ?? 0) + 1;
      attempts.set(key, count);
      return count <= maxAttempts;
    },
    async reset(key) {
      attempts.delete(key);
      resets.push(key);
    },
  };
}

type MemoryState = {
  accounts: Map<string, Account>;
  sessions: Map<string, Session>;
  authenticators: Map<string, StoredAuthenticator>;
  recoveryCodes: Map<string, { codeHash: string; usedAt: Date | null }[]>;
  tokens: Map<string, AccountToken & { usedAt: Date | null }>;
};

const roleOrder = { owner: 0, admin: 1, sales: 2, staff: 3 } as const;

/**
 * Accounts, sessions, authenticators and email links in memory, sharing one
 * state as the Postgres stores share one database.
 */
export function memoryAccountStores(): { accounts: AccountStore; sessions: SessionStore; mfa: MfaStore; tokens: AccountTokenStore } {
  const state: MemoryState = { accounts: new Map(), sessions: new Map(), authenticators: new Map(), recoveryCodes: new Map(), tokens: new Map() };
  const copy = (account: Account): Account => ({ ...account });
  const mfaEnabled = (id: string) => Boolean(state.authenticators.get(id)?.confirmedAt);
  const anotherActiveOwner = (id: string) => [...state.accounts.values()].some((other) => other.id !== id && other.role === "owner" && other.status === "active");
  const endSessions = (accountId: string, keepSessionHash: string | null = null) => {
    let ended = 0;
    for (const [hash, session] of state.sessions) {
      if (session.accountId === accountId && hash !== keepSessionHash) {
        state.sessions.delete(hash);
        ended++;
      }
    }
    return ended;
  };
  const removeAccountData = (id: string) => {
    endSessions(id);
    state.authenticators.delete(id);
    state.recoveryCodes.delete(id);
    for (const [hash, token] of state.tokens) if (token.accountId === id) state.tokens.delete(hash);
  };

  const accounts: AccountStore = {
    async anyExist() {
      return state.accounts.size > 0;
    },
    async findById(id) {
      const found = state.accounts.get(id);
      return found ? copy(found) : null;
    },
    async findByEmail(email) {
      const found = [...state.accounts.values()].find((account) => account.email === email.toLowerCase());
      return found ? copy(found) : null;
    },
    async list() {
      return [...state.accounts.values()]
        .sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1))
        .map((account): TeamMember => {
          const { passwordHash, ...member } = account;
          void passwordHash;
          return { ...member, mfaEnabled: mfaEnabled(member.id) };
        });
    },
    async createFirstOwner(account) {
      if (state.accounts.size > 0) return false;
      state.accounts.set(account.id, { ...account, email: account.email.toLowerCase(), role: "owner", status: "active" });
      return true;
    },
    async create(account) {
      if ([...state.accounts.values()].some((other) => other.email === account.email.toLowerCase())) return { status: "email-taken" };
      state.accounts.set(account.id, { ...account, email: account.email.toLowerCase() });
      return { status: "created" };
    },
    async changeRole(id, { from, to, at }) {
      const account = state.accounts.get(id);
      if (!account || account.role !== from) return "stale";
      if (from === "owner" && to !== "owner" && !anotherActiveOwner(id)) return "last-owner";
      state.accounts.set(id, { ...account, role: to, updatedAt: at });
      endSessions(id);
      return "changed";
    },
    async setStatus(id, { status, role, at }) {
      const account = state.accounts.get(id);
      if (!account || account.role !== role) return "stale";
      if (status === "disabled" && role === "owner" && !anotherActiveOwner(id)) return "last-owner";
      state.accounts.set(id, { ...account, status, updatedAt: at });
      if (status === "disabled") endSessions(id);
      return "changed";
    },
    async remove(id, { role }) {
      const account = state.accounts.get(id);
      if (!account || account.role !== role) return "stale";
      if (role === "owner" && !anotherActiveOwner(id)) return "last-owner";
      state.accounts.delete(id);
      removeAccountData(id);
      return "changed";
    },
    async setPassword(id, { passwordHash, temporary, at, keepSessionHash }) {
      const account = state.accounts.get(id);
      if (!account) return false;
      state.accounts.set(id, { ...account, passwordHash, mustChangePassword: temporary !== null, temporaryPasswordExpiresAt: temporary?.expiresAt ?? null, updatedAt: at });
      endSessions(id, keepSessionHash);
      for (const token of state.tokens.values()) if (token.accountId === id && token.purpose === "password-reset" && !token.usedAt) token.usedAt = at;
      return true;
    },
    async markEmailVerified(id, { email, at }) {
      const account = state.accounts.get(id);
      if (!account || account.email !== email.toLowerCase()) return false;
      state.accounts.set(id, { ...account, emailVerifiedAt: at, updatedAt: at });
      return true;
    },
    async recordSignIn(id, at) {
      const account = state.accounts.get(id);
      if (account) state.accounts.set(id, { ...account, lastSignedInAt: at });
    },
  };

  const sessions: SessionStore = {
    async create(session) {
      state.sessions.set(session.tokenHash, { ...session });
    },
    async findWithAccount(tokenHash) {
      const session = state.sessions.get(tokenHash);
      const account = session && state.accounts.get(session.accountId);
      return session && account ? { session: { ...session }, account: copy(account), mfaEnabled: mfaEnabled(account.id) } : null;
    },
    async extend(tokenHash, { idleExpiresAt, at, unlessExtendedSince }) {
      const session = state.sessions.get(tokenHash);
      if (!session || session.lastExtendedAt.getTime() >= unlessExtendedSince.getTime()) return false;
      const capped = new Date(Math.min(idleExpiresAt.getTime(), session.absoluteExpiresAt.getTime()));
      state.sessions.set(tokenHash, { ...session, idleExpiresAt: capped, lastExtendedAt: at });
      return true;
    },
    async markSteppedUp(tokenHash, at) {
      const session = state.sessions.get(tokenHash);
      if (!session) return false;
      state.sessions.set(tokenHash, { ...session, stepUpAt: at });
      return true;
    },
    async delete(tokenHash) {
      state.sessions.delete(tokenHash);
    },
    async deleteForAccount(accountId, keepSessionHash = null) {
      return endSessions(accountId, keepSessionHash);
    },
    async listForAccount(accountId, now) {
      return [...state.sessions.values()]
        .filter((session) => session.accountId === accountId && session.idleExpiresAt.getTime() > now.getTime() && session.absoluteExpiresAt.getTime() > now.getTime())
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((session) => ({ ...session }));
    },
    async deleteExpired(now) {
      let removed = 0;
      for (const [hash, session] of state.sessions) {
        if (session.idleExpiresAt.getTime() <= now.getTime() || session.absoluteExpiresAt.getTime() <= now.getTime()) {
          state.sessions.delete(hash);
          removed++;
        }
      }
      return removed;
    },
  };

  const mfa: MfaStore = {
    async find(accountId) {
      const found = state.authenticators.get(accountId);
      return found ? { ...found } : null;
    },
    async beginEnrolment(accountId, { secretCiphertext }) {
      if (state.authenticators.get(accountId)?.confirmedAt) return false;
      state.authenticators.set(accountId, { secretCiphertext, confirmedAt: null, lastUsedStep: null });
      return true;
    },
    async confirmEnrolment(accountId, { at, step, recoveryCodeHashes }) {
      const pending = state.authenticators.get(accountId);
      if (!pending || pending.confirmedAt) return false;
      state.authenticators.set(accountId, { ...pending, confirmedAt: at, lastUsedStep: step });
      state.recoveryCodes.set(accountId, recoveryCodeHashes.map((codeHash) => ({ codeHash, usedAt: null })));
      return true;
    },
    async listSecretCiphertexts() {
      return [...state.authenticators].map(([accountId, { secretCiphertext }]) => ({ accountId, secretCiphertext }));
    },
    async replaceSecretCiphertext(accountId, { previous, next }) {
      const found = state.authenticators.get(accountId);
      if (!found || found.secretCiphertext !== previous) return false;
      state.authenticators.set(accountId, { ...found, secretCiphertext: next });
      return true;
    },
    async recordUse(accountId, step) {
      const found = state.authenticators.get(accountId);
      if (!found?.confirmedAt || (found.lastUsedStep !== null && found.lastUsedStep >= step)) return false;
      state.authenticators.set(accountId, { ...found, lastUsedStep: step });
      return true;
    },
    async remove(accountId) {
      state.authenticators.delete(accountId);
      state.recoveryCodes.delete(accountId);
    },
    async replaceRecoveryCodes(accountId, codeHashes) {
      state.recoveryCodes.set(accountId, codeHashes.map((codeHash) => ({ codeHash, usedAt: null })));
    },
    async useRecoveryCode(accountId, codeHash, at) {
      const code = state.recoveryCodes.get(accountId)?.find((candidate) => candidate.codeHash === codeHash && !candidate.usedAt);
      if (!code) return false;
      code.usedAt = at;
      return true;
    },
    async countUnusedRecoveryCodes(accountId) {
      return (state.recoveryCodes.get(accountId) ?? []).filter((code) => !code.usedAt).length;
    },
  };

  const tokens: AccountTokenStore = {
    async issue(token) {
      for (const existing of state.tokens.values()) {
        if (existing.accountId === token.accountId && existing.purpose === token.purpose && !existing.usedAt) existing.usedAt = token.createdAt;
      }
      state.tokens.set(token.tokenHash, { ...token, email: token.email.toLowerCase(), usedAt: null });
    },
    async consume(tokenHash, purpose, now) {
      const token = state.tokens.get(tokenHash);
      if (!token || token.purpose !== purpose || token.usedAt || token.expiresAt.getTime() <= now.getTime()) return null;
      token.usedAt = now;
      return { accountId: token.accountId, email: token.email };
    },
    async deleteExpired(now) {
      let removed = 0;
      for (const [hash, token] of state.tokens) {
        if (token.expiresAt.getTime() <= now.getTime()) {
          state.tokens.delete(hash);
          removed++;
        }
      }
      return removed;
    },
  };

  return { accounts, sessions, mfa, tokens };
}
