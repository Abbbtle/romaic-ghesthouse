import "server-only";
import type { Account, AccountStatus, AccountStore, Session, SessionStore, TeamChangeOutcome, TeamMember } from "@/lib/accounts/ports";
import type { Role } from "@/lib/kernel/actor";
import { isRole } from "@/lib/kernel/actor";
import type { Database, SqlTransaction } from "./database";
import { UniqueViolationError } from "./errors";
import { advisoryLocks } from "./locks";
import { isUuid } from "./uuid";

/**
 * The account and session stores over Postgres (app.accounts, app.sessions;
 * see ./migrations/010-accounts.ts). Writes that must hold together (the
 * first owner, the last active owner, a password with its sign-outs, a role
 * change with its sign-outs) are one transaction each.
 */

type AccountRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  password_hash: string;
  must_change_password: boolean;
  temporary_password_expires_at: Date | null;
  email_verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
  last_signed_in_at: Date | null;
};

type SessionRow = {
  token_hash: string;
  account_id: string;
  session_created_at: Date;
  idle_expires_at: Date;
  absolute_expires_at: Date;
  last_extended_at: Date;
  mfa_verified_at: Date | null;
  step_up_at: Date | null;
  device: string;
};

/** The unique constraint that refuses a second account with one address (named in 010-accounts). */
export const accountsEmailUnique = "accounts_email_unique";

const accountColumns =
  "a.id, a.email, a.name, a.role, a.status, a.password_hash, a.must_change_password, a.temporary_password_expires_at, a.email_verified_at, a.created_at, a.updated_at, a.last_signed_in_at";

const sessionColumns =
  "s.token_hash, s.account_id, s.created_at as session_created_at, s.idle_expires_at, s.absolute_expires_at, s.last_extended_at, s.mfa_verified_at, s.step_up_at, s.device";

/** Whether the account has a confirmed authenticator, as a column. */
const mfaEnabledColumn = "exists (select from app.mfa_totp m where m.account_id = a.id and m.confirmed_at is not null) as mfa_enabled";

function toStatus(value: string, id: string): AccountStatus {
  if (value === "active" || value === "disabled") return value;
  throw new Error(`Account ${id} has a status the dashboard doesn't know.`);
}

function toAccount(row: AccountRow): Account {
  // The table's check constraint allows only these; a row that slipped past it is a bug, not a role.
  if (!isRole(row.role)) throw new Error(`Account ${row.id} has a role the dashboard doesn't know.`);
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: toStatus(row.status, row.id),
    passwordHash: row.password_hash,
    mustChangePassword: row.must_change_password,
    temporaryPasswordExpiresAt: row.temporary_password_expires_at,
    emailVerifiedAt: row.email_verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSignedInAt: row.last_signed_in_at,
  };
}

function toTeamMember(row: AccountRow & { mfa_enabled: boolean }): TeamMember {
  const { passwordHash, ...rest } = toAccount(row);
  void passwordHash;
  return { ...rest, mfaEnabled: row.mfa_enabled };
}

function toSession(row: SessionRow): Session {
  return {
    tokenHash: row.token_hash,
    accountId: row.account_id,
    createdAt: row.session_created_at,
    idleExpiresAt: row.idle_expires_at,
    absoluteExpiresAt: row.absolute_expires_at,
    lastExtendedAt: row.last_extended_at,
    mfaVerifiedAt: row.mfa_verified_at,
    stepUpAt: row.step_up_at,
    device: row.device,
  };
}

/**
 * Takes the team lock until the transaction ends. Changes whose checks span
 * several accounts (no account yet, another active owner) take it first, so
 * they run one after another instead of each acting on what it read before
 * the other committed.
 */
async function lockTeam(tx: SqlTransaction): Promise<void> {
  await tx.get("select pg_advisory_xact_lock(:lock)", { lock: advisoryLocks.team });
}

async function insertAccount(tx: SqlTransaction, account: Account): Promise<void> {
  await tx.run(
    `insert into app.accounts (id, email, name, role, status, password_hash, must_change_password, temporary_password_expires_at,
       email_verified_at, created_at, updated_at, last_signed_in_at)
     values (:id, :email, :name, :role, :status, :passwordHash, :mustChangePassword, :temporaryPasswordExpiresAt,
       :emailVerifiedAt, :createdAt, :updatedAt, :lastSignedInAt)`,
    {
      id: account.id,
      email: account.email.toLowerCase(),
      name: account.name,
      role: account.role,
      status: account.status,
      passwordHash: account.passwordHash,
      mustChangePassword: account.mustChangePassword,
      temporaryPasswordExpiresAt: account.temporaryPasswordExpiresAt,
      emailVerifiedAt: account.emailVerifiedAt,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      lastSignedInAt: account.lastSignedInAt,
    },
  );
}

/** Whether another active owner exists besides account :id: the guard before an owner stops being one. */
const anotherActiveOwner = "exists (select from app.accounts o where o.role = 'owner' and o.status = 'active' and o.id <> :id)";

/**
 * Why a guarded team change touched no row, asked inside its transaction
 * (the team lock still held): the account is there with the expected role,
 * so only the owner guard can have stopped it, or it isn't, so it's stale.
 */
async function whyRefused(tx: SqlTransaction, id: string, expectedRole: Role): Promise<Exclude<TeamChangeOutcome, "changed">> {
  const still = await tx.get<{ found: number }>("select 1 as found from app.accounts where id = :id and role = :role", { id, role: expectedRole });
  return still ? "last-owner" : "stale";
}

export function createPostgresAccountStore(db: Database): AccountStore {
  return {
    async anyExist() {
      return (await db.get<{ found: boolean }>("select exists (select from app.accounts) as found"))?.found ?? false;
    },

    async findById(id) {
      if (!isUuid(id)) return null;
      const row = await db.get<AccountRow>(`select ${accountColumns} from app.accounts a where a.id = :id`, { id });
      return row ? toAccount(row) : null;
    },

    async findByEmail(email) {
      const row = await db.get<AccountRow>(`select ${accountColumns} from app.accounts a where a.email = :email`, { email: email.toLowerCase() });
      return row ? toAccount(row) : null;
    },

    async list() {
      // Names sort by code point, the same on every server whatever its locale.
      const rows = await db.all<AccountRow & { mfa_enabled: boolean }>(
        `select ${accountColumns}, ${mfaEnabledColumn} from app.accounts a
         order by case a.role when 'owner' then 0 when 'admin' then 1 when 'sales' then 2 else 3 end, a.name collate "C", a.id`,
      );
      return rows.map(toTeamMember);
    },

    async createFirstOwner(account) {
      return db.transaction(async (tx) => {
        // Whoever takes the lock first creates the first account; anyone after them finds it there.
        await lockTeam(tx);
        const existing = await tx.get<{ found: boolean }>("select exists (select from app.accounts) as found");
        if (existing?.found) return false;
        await insertAccount(tx, { ...account, role: "owner", status: "active" });
        return true;
      });
    },

    async create(account) {
      try {
        await db.transaction((tx) => insertAccount(tx, account));
        return { status: "created" };
      } catch (error) {
        if (error instanceof UniqueViolationError && error.constraint === accountsEmailUnique) return { status: "email-taken" };
        throw error;
      }
    },

    async changeRole(id, { from, to, at }) {
      if (!isUuid(id)) return "stale";
      return db.transaction(async (tx) => {
        // Two owners demoting each other at once would otherwise both see the other still there.
        await lockTeam(tx);
        const { changes } = await tx.run(
          `update app.accounts set role = :to, updated_at = :at
           where id = :id and role = :from and (:from <> 'owner' or :to = 'owner' or ${anotherActiveOwner})`,
          { id, from, to, at },
        );
        if (changes === 0) return whyRefused(tx, id, from);
        // A new role means new permissions: sign in again to get them.
        await tx.run("delete from app.sessions where account_id = :id", { id });
        return "changed";
      });
    },

    async setStatus(id, { status, role, at }) {
      if (!isUuid(id)) return "stale";
      return db.transaction(async (tx) => {
        await lockTeam(tx);
        const { changes } = await tx.run(
          `update app.accounts set status = :status, updated_at = :at
           where id = :id and role = :role and (:status = 'active' or :role <> 'owner' or ${anotherActiveOwner})`,
          { id, status, role, at },
        );
        if (changes === 0) return whyRefused(tx, id, role);
        if (status === "disabled") await tx.run("delete from app.sessions where account_id = :id", { id });
        return "changed";
      });
    },

    async remove(id, { role }) {
      if (!isUuid(id)) return "stale";
      return db.transaction(async (tx) => {
        await lockTeam(tx);
        // Deleting the account deletes its sessions, authenticator and links with it (on delete cascade).
        const { changes } = await tx.run(`delete from app.accounts where id = :id and role = :role and (:role <> 'owner' or ${anotherActiveOwner})`, { id, role });
        return changes > 0 ? "changed" : whyRefused(tx, id, role);
      });
    },

    async setPassword(id, { passwordHash, temporary, at, keepSessionHash }) {
      if (!isUuid(id)) return false;
      return db.transaction(async (tx) => {
        const { changes } = await tx.run(
          `update app.accounts set password_hash = :passwordHash, must_change_password = :mustChange,
             temporary_password_expires_at = :expiresAt, updated_at = :at
           where id = :id`,
          { id, passwordHash, mustChange: temporary !== null, expiresAt: temporary?.expiresAt ?? null, at },
        );
        if (changes === 0) return false;
        await tx.run("delete from app.sessions where account_id = :id and token_hash is distinct from :keep", { id, keep: keepSessionHash });
        // A password set by any route retires reset links that were still waiting.
        await tx.run("update app.account_tokens set used_at = :at where account_id = :id and purpose = 'password-reset' and used_at is null", { id, at });
        return true;
      });
    },

    async markEmailVerified(id, { email, at }) {
      if (!isUuid(id)) return false;
      const { changes } = await db.run("update app.accounts set email_verified_at = :at, updated_at = :at where id = :id and email = :email", { id, email: email.toLowerCase(), at });
      return changes > 0;
    },

    async recordSignIn(id, at) {
      if (!isUuid(id)) return;
      await db.run("update app.accounts set last_signed_in_at = :at where id = :id", { id, at });
    },
  };
}

export function createPostgresSessionStore(db: Database): SessionStore {
  return {
    async create(session) {
      await db.run(
        `insert into app.sessions (token_hash, account_id, created_at, idle_expires_at, absolute_expires_at, last_extended_at, mfa_verified_at, step_up_at, device)
         values (:tokenHash, :accountId, :createdAt, :idleExpiresAt, :absoluteExpiresAt, :lastExtendedAt, :mfaVerifiedAt, :stepUpAt, :device)`,
        { ...session },
      );
    },

    async findWithAccount(tokenHash) {
      const row = await db.get<SessionRow & AccountRow & { mfa_enabled: boolean }>(
        `select ${sessionColumns}, ${accountColumns}, ${mfaEnabledColumn}
         from app.sessions s join app.accounts a on a.id = s.account_id
         where s.token_hash = :tokenHash`,
        { tokenHash },
      );
      return row ? { session: toSession(row), account: toAccount(row), mfaEnabled: row.mfa_enabled } : null;
    },

    async extend(tokenHash, { idleExpiresAt, at, unlessExtendedSince }) {
      const { changes } = await db.run(
        `update app.sessions set idle_expires_at = least(:idleExpiresAt::timestamptz, absolute_expires_at), last_extended_at = :at
         where token_hash = :tokenHash and last_extended_at < :unlessExtendedSince`,
        { tokenHash, idleExpiresAt, at, unlessExtendedSince },
      );
      return changes > 0;
    },

    async markSteppedUp(tokenHash, at) {
      const { changes } = await db.run("update app.sessions set step_up_at = :at where token_hash = :tokenHash", { tokenHash, at });
      return changes > 0;
    },

    async delete(tokenHash) {
      await db.run("delete from app.sessions where token_hash = :tokenHash", { tokenHash });
    },

    async deleteForAccount(accountId, keepSessionHash = null) {
      if (!isUuid(accountId)) return 0;
      return (await db.run("delete from app.sessions where account_id = :accountId and token_hash is distinct from :keep", { accountId, keep: keepSessionHash })).changes;
    },

    async listForAccount(accountId, now) {
      if (!isUuid(accountId)) return [];
      const rows = await db.all<SessionRow>(
        `select ${sessionColumns} from app.sessions s
         where s.account_id = :accountId and s.idle_expires_at > :now and s.absolute_expires_at > :now
         order by s.created_at desc`,
        { accountId, now },
      );
      return rows.map(toSession);
    },

    async deleteExpired(now) {
      return (await db.run("delete from app.sessions where idle_expires_at <= :now or absolute_expires_at <= :now", { now })).changes;
    },
  };
}

/** Both stores over one database, as the account services take them. */
export function createPostgresAccountStores(db: Database): { accounts: AccountStore; sessions: SessionStore } {
  return { accounts: createPostgresAccountStore(db), sessions: createPostgresSessionStore(db) };
}
