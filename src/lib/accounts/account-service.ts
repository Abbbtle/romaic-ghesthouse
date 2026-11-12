import type { Actor } from "@/lib/kernel/actor";
import type { AuditRecorder } from "@/lib/kernel/audit";
import type { Clock, FieldCipher } from "@/lib/kernel/ports";
import { tooManyMessage, type RateLimiter } from "@/lib/kernel/rate-limit";
import { done, refused, refusedWith, type ChangeResult } from "@/lib/kernel/result";
import { mfaRequiredFor, nextStepFor, type NextStep, type SignedInState } from "./access";
import { passwordProblem, type ChangePasswordInput, type ReplaceTemporaryPasswordInput, type SignInInput } from "./input";
import { mfaSecretContext, refreshMfaSecret } from "./mfa-secrets";
import { mfaLimit, signInLimit } from "./rate-limits";
import type {
  Account,
  AccountStore,
  MfaStore,
  PasswordHasher,
  SecretGenerator,
  RequestContext,
  Session,
  SessionStore,
  TokenHasher,
  TotpAuthenticator,
} from "./ports";
import { isSessionToken, sessionEnded, sessionHandle, sessionRenewal, startSession, type NewSession } from "./sessions";

/** Who a browser is signed in as. */
export type SignedIn = SignedInState & {
  email: string;
  /** Whether an authenticator is set up for the account. */
  mfaEnabled: boolean;
  emailVerified: boolean;
  /** This session's public handle (see sessionHandle). */
  sessionHandle: string;
};

/** Where someone goes after a step of signing in. */
export type SignInResult = ChangeResult<{ session: NewSession; next: NextStep }>;

/** A session as the account page lists it. */
export type SessionSummary = {
  handle: string;
  device: string;
  createdAt: Date;
  lastActiveAt: Date;
  current: boolean;
};

export type AccountServiceDependencies = {
  accounts: AccountStore;
  sessions: SessionStore;
  mfa: MfaStore;
  passwords: PasswordHasher;
  tokens: TokenHasher;
  secrets: SecretGenerator;
  totp: TotpAuthenticator;
  /** Encrypts authenticator secrets at rest. */
  cipher: FieldCipher;
  clock: Clock;
  /** Counts sign-in attempts per email address and per visitor, and current-password checks per account. */
  signInLimiter: RateLimiter;
  /** Counts authenticator and recovery-code attempts per account. */
  mfaLimiter: RateLimiter;
  audit: AuditRecorder;
  /** The name authenticator apps show for the account ("Romaic Guesthouse"). */
  issuer: string;
};

const wrongCredentials = "That email and password don't match. Try again, or ask the owner to reset your password.";
const tooManySignIns = tooManyMessage(signInLimit);
const tooManyCodes = tooManyMessage(mfaLimit);
const accountGone = "Your account no longer exists. Ask the owner to add you again.";
const accountDisabled = "Your account is turned off. Ask the owner to turn it back on.";
const temporaryExpired = "Your temporary password has expired. Ask for a new one.";
const wrongCode = "That code didn't work. Check your authenticator app and try again.";
const sessionGone = "You've been signed out. Sign in again.";

const recoveryCodePattern = /^[a-z0-9]{5}-?[a-z0-9]{5}$/i;
const recoveryCodeCount = 10;

function actorOf(account: Pick<Account, "id" | "role" | "name">): Actor {
  return { id: account.id, role: account.role, name: account.name };
}

/** Recovery codes are compared without their hyphen or case. */
function normalizeRecoveryCode(code: string): string {
  return code.replace(/[\s-]/g, "").toLowerCase();
}

/** Signing in and out, sessions, each person's own password, and their authenticator. */
export function createAccountService(deps: AccountServiceDependencies) {
  // Verifying against a real hash when the email is unknown keeps the response time the same,
  // so timing doesn't reveal which addresses have accounts.
  let decoyHash: Promise<string> | null = null;
  const decoy = () => (decoyHash ??= deps.passwords.hash(deps.secrets.temporaryPassword()));

  /** The session behind a cookie and its account, if the session is live and the account active. */
  const liveSession = async (token: string | undefined) => {
    if (!token || !isSessionToken(token)) return null;
    const tokenHash = deps.tokens.hash(token);
    const found = await deps.sessions.findWithAccount(tokenHash);
    if (!found) return null;
    const now = deps.clock.now();
    if (sessionEnded(found.session, now) || found.account.status !== "active") {
      await deps.sessions.delete(tokenHash);
      return null;
    }
    return { ...found, tokenHash, now };
  };

  const stateOf = (session: Session, account: Account, mfaEnabled: boolean): SignedIn => ({
    actor: actorOf(account),
    email: account.email,
    mfaDue: mfaEnabled && session.mfaVerifiedAt === null,
    mustChangePassword: account.mustChangePassword,
    mfaEnrolmentDue: mfaRequiredFor(account.role) && !mfaEnabled,
    stepUpAt: session.stepUpAt,
    mfaEnabled,
    emailVerified: account.emailVerifiedAt !== null,
    sessionHandle: sessionHandle(session.tokenHash),
  });

  /** Replaces a session with a new token that has passed the authenticator step, keeping its absolute limit. */
  const rotateVerified = async (old: { tokenHash: string; session: Session; account: Account }, device: string): Promise<NewSession> => {
    const next = await startSession(deps, old.account, { mfaVerified: true, device, absoluteExpiresAt: old.session.absoluteExpiresAt });
    await deps.sessions.delete(old.tokenHash);
    return next;
  };

  /** Checks an authenticator or recovery code for an account, using either up. */
  const acceptCode = async (account: Account, code: string): Promise<"totp" | "recovery" | null> => {
    const stored = await deps.mfa.find(account.id);
    if (!stored?.confirmedAt) return null;
    const typed = code.trim();
    if (recoveryCodePattern.test(typed)) {
      const used = await deps.mfa.useRecoveryCode(account.id, deps.tokens.hash(normalizeRecoveryCode(typed)), deps.clock.now());
      return used ? "recovery" : null;
    }
    const secret = deps.cipher.decrypt(stored.secretCiphertext, mfaSecretContext(account.id));
    const match = deps.totp.verify(secret, typed, deps.clock.now());
    if (!match || !(await deps.mfa.recordUse(account.id, match.step))) return null;
    // Encrypted under a key that's being retired: move it onto the newest one now it's in hand.
    await refreshMfaSecret(deps, account.id, stored.secretCiphertext, secret);
    return "totp";
  };

  /** Sets the account's own new password, ending every other session; `currentToken`'s session stays. */
  const setOwnPassword = async (account: Account, password: string, currentToken: string | undefined): Promise<ChangeResult> => {
    const problem = passwordProblem(password, account.email);
    if (problem) return refused({ newPassword: problem });
    const changed = await deps.accounts.setPassword(account.id, {
      passwordHash: await deps.passwords.hash(password),
      temporary: null,
      at: deps.clock.now(),
      keepSessionHash: currentToken && isSessionToken(currentToken) ? deps.tokens.hash(currentToken) : null,
    });
    if (!changed) return refusedWith(accountGone);
    await deps.audit.record({ actor: actorOf(account), category: "security", action: "password.changed", target: { type: "account", id: account.id }, summary: "Changed their password" });
    return done();
  };

  return {
    /** Checks an email address and password. */
    async signIn(input: SignInInput, { visitorKey, device }: RequestContext): Promise<SignInResult> {
      // Both limits count every attempt, so neither can be used up without the other noticing.
      const allowed = await Promise.all([`email:${input.email}`, `visitor:${visitorKey}`].map((key) => deps.signInLimiter.tryConsume(key)));
      if (!allowed.every(Boolean)) return refusedWith(tooManySignIns);

      const account = await deps.accounts.findByEmail(input.email);
      const matches = await deps.passwords.verify(input.password, account?.passwordHash ?? (await decoy()));
      if (!account || !matches) {
        await deps.audit.record({
          actor: null,
          category: "auth",
          action: "sign-in.failed",
          ...(account ? { target: { type: "account", id: account.id } } : {}),
          summary: account ? `Failed sign-in for ${account.name}` : "Failed sign-in for an unknown address",
          ipHash: visitorKey,
        });
        return refusedWith(wrongCredentials);
      }
      if (account.status !== "active") return refusedWith(accountDisabled);
      const now = deps.clock.now();
      if (account.mustChangePassword && account.temporaryPasswordExpiresAt && account.temporaryPasswordExpiresAt.getTime() <= now.getTime()) {
        return refusedWith(temporaryExpired);
      }

      await deps.signInLimiter.reset(`email:${input.email}`);
      const mfaEnabled = Boolean((await deps.mfa.find(account.id))?.confirmedAt);
      // Without an authenticator to check, the session is complete at once, unless the role
      // needs one: then it's marked complete when the authenticator is set up.
      const mfaVerified = !mfaEnabled && !mfaRequiredFor(account.role);
      const session = await startSession(deps, account, { mfaVerified, device });
      await deps.audit.record({ actor: actorOf(account), category: "auth", action: "sign-in.password", target: { type: "account", id: account.id }, summary: "Signed in with their password", ipHash: visitorKey });
      return done({
        session,
        next: nextStepFor({ mfaDue: mfaEnabled, mustChangePassword: account.mustChangePassword, mfaEnrolmentDue: mfaRequiredFor(account.role) && !mfaEnabled }),
      });
    },

    /**
     * Who a session cookie belongs to, or null when it's missing, ended or
     * revoked, or the account is turned off. Using a session moves its idle
     * limit on (never past its absolute limit).
     */
    async authenticate(token: string | undefined): Promise<SignedIn | null> {
      const live = await liveSession(token);
      if (!live) return null;
      const renewal = sessionRenewal(live.session, live.account.role, live.now);
      if (renewal) await deps.sessions.extend(live.tokenHash, { ...renewal, at: live.now });
      return stateOf(live.session, live.account, live.mfaEnabled);
    },

    /** The authenticator step of signing in: an authenticator code, or one of the recovery codes. */
    async verifyMfa(token: string | undefined, code: string, { device }: Pick<RequestContext, "device">): Promise<ChangeResult<{ session: NewSession; next: NextStep; usedRecoveryCode: boolean }>> {
      const live = await liveSession(token);
      if (!live) return refusedWith(sessionGone);
      if (!live.mfaEnabled || live.session.mfaVerifiedAt) return refusedWith("There's no code to enter. Reload the page.");
      if (!(await deps.mfaLimiter.tryConsume(`mfa:${live.account.id}`))) return refusedWith(tooManyCodes);
      const accepted = await acceptCode(live.account, code);
      if (!accepted) {
        await deps.audit.record({ actor: actorOf(live.account), category: "auth", action: "mfa.failed", target: { type: "account", id: live.account.id }, summary: "Entered a wrong authenticator code" });
        return refused({ code: wrongCode });
      }
      await deps.mfaLimiter.reset(`mfa:${live.account.id}`);
      const session = await rotateVerified(live, device);
      await deps.audit.record({
        actor: actorOf(live.account),
        category: "auth",
        action: accepted === "recovery" ? "mfa.recovery-code-used" : "mfa.verified",
        target: { type: "account", id: live.account.id },
        summary: accepted === "recovery" ? "Signed in with a recovery code" : "Signed in with their authenticator",
      });
      return done({ session, next: nextStepFor({ mfaDue: false, mustChangePassword: live.account.mustChangePassword, mfaEnrolmentDue: false }), usedRecoveryCode: accepted === "recovery" });
    },

    /**
     * Starts setting up an authenticator: a new secret, kept encrypted until
     * the first correct code confirms it. Returns the secret (for typing in)
     * and the otpauth link (for the QR code).
     */
    async beginMfaEnrolment(token: string | undefined): Promise<ChangeResult<{ secret: string; uri: string }>> {
      const live = await liveSession(token);
      if (!live) return refusedWith(sessionGone);
      if (live.account.mustChangePassword) return refusedWith("Choose your own password first.");
      if (live.mfaEnabled) return refusedWith("An authenticator is already set up for your account.");
      const secret = deps.totp.newSecret();
      const started = await deps.mfa.beginEnrolment(live.account.id, { secretCiphertext: deps.cipher.encrypt(secret, mfaSecretContext(live.account.id)), at: live.now });
      if (!started) return refusedWith("An authenticator is already set up for your account.");
      return done({ secret, uri: deps.totp.provisioningUri(secret, live.account.email, deps.issuer) });
    },

    /** Confirms the authenticator with its first code, and hands back the recovery codes to keep (shown once). */
    async confirmMfaEnrolment(token: string | undefined, code: string, { device }: Pick<RequestContext, "device">): Promise<ChangeResult<{ session: NewSession; recoveryCodes: string[] }>> {
      const live = await liveSession(token);
      if (!live) return refusedWith(sessionGone);
      if (!(await deps.mfaLimiter.tryConsume(`mfa:${live.account.id}`))) return refusedWith(tooManyCodes);
      const pending = await deps.mfa.find(live.account.id);
      if (!pending || pending.confirmedAt) return refusedWith("Start setting up your authenticator again: reload the page.");
      const secret = deps.cipher.decrypt(pending.secretCiphertext, mfaSecretContext(live.account.id));
      const match = deps.totp.verify(secret, code, live.now);
      if (!match) return refused({ code: wrongCode });
      const recoveryCodes = Array.from({ length: recoveryCodeCount }, () => deps.secrets.recoveryCode());
      const confirmed = await deps.mfa.confirmEnrolment(live.account.id, {
        at: live.now,
        step: match.step,
        recoveryCodeHashes: recoveryCodes.map((recovery) => deps.tokens.hash(normalizeRecoveryCode(recovery))),
      });
      if (!confirmed) return refusedWith("Start setting up your authenticator again: reload the page.");
      await deps.mfaLimiter.reset(`mfa:${live.account.id}`);
      const session = await rotateVerified(live, device);
      await deps.audit.record({ actor: actorOf(live.account), category: "security", action: "mfa.enabled", target: { type: "account", id: live.account.id }, summary: "Set up an authenticator app" });
      return done({ session, recoveryCodes });
    },

    /** Re-checks the password and code before a sensitive action (step-up); good for 15 minutes in this session. */
    async stepUp(token: string | undefined, input: { password: string; code: string }): Promise<ChangeResult> {
      const live = await liveSession(token);
      if (!live) return refusedWith(sessionGone);
      if (!(await deps.signInLimiter.tryConsume(`password:${live.account.id}`))) return refusedWith(tooManySignIns);
      if (!(await deps.passwords.verify(input.password, live.account.passwordHash))) return refused({ password: "That isn't your password." });
      if (live.mfaEnabled && !(await acceptCode(live.account, input.code))) return refused({ code: wrongCode });
      await deps.sessions.markSteppedUp(live.tokenHash, live.now);
      await deps.audit.record({ actor: actorOf(live.account), category: "auth", action: "step-up", target: { type: "account", id: live.account.id }, summary: "Confirmed their password and code for a sensitive change" });
      return done();
    },

    /** New recovery codes, replacing the old ones (the caller requires step-up). */
    async regenerateRecoveryCodes(actor: Actor): Promise<ChangeResult<{ recoveryCodes: string[] }>> {
      const stored = await deps.mfa.find(actor.id);
      if (!stored?.confirmedAt) return refusedWith("Set up an authenticator first.");
      const recoveryCodes = Array.from({ length: recoveryCodeCount }, () => deps.secrets.recoveryCode());
      await deps.mfa.replaceRecoveryCodes(actor.id, recoveryCodes.map((recovery) => deps.tokens.hash(normalizeRecoveryCode(recovery))), deps.clock.now());
      await deps.audit.record({ actor, category: "security", action: "mfa.recovery-codes-replaced", target: { type: "account", id: actor.id }, summary: "Made new recovery codes" });
      return done({ recoveryCodes });
    },

    async recoveryCodesLeft(actor: Actor): Promise<number> {
      return deps.mfa.countUnusedRecoveryCodes(actor.id);
    },

    /** Turns off an authenticator for someone whose role doesn't need one (staff). The caller requires step-up. */
    async disableMfa(actor: Actor): Promise<ChangeResult> {
      if (mfaRequiredFor(actor.role)) return refusedWith("Your role needs an authenticator, so it can't be turned off.");
      await deps.mfa.remove(actor.id);
      await deps.audit.record({ actor, category: "security", action: "mfa.disabled", target: { type: "account", id: actor.id }, summary: "Turned off their authenticator app" });
      return done();
    },

    /** Ends this browser's session. */
    async signOut(token: string | undefined): Promise<void> {
      if (token && isSessionToken(token)) await deps.sessions.delete(deps.tokens.hash(token));
    },

    /** Ends every session the person has, this browser's included. */
    async signOutEverywhere(actor: Actor): Promise<void> {
      const ended = await deps.sessions.deleteForAccount(actor.id);
      await deps.audit.record({ actor, category: "security", action: "sessions.ended-all", target: { type: "account", id: actor.id }, summary: `Signed out everywhere (${ended} session${ended === 1 ? "" : "s"})` });
    },

    /** The person's sessions, newest first, marking this browser's. */
    async listSessions(actor: Actor, currentToken: string | undefined): Promise<SessionSummary[]> {
      const currentHash = currentToken && isSessionToken(currentToken) ? deps.tokens.hash(currentToken) : null;
      const sessions = await deps.sessions.listForAccount(actor.id, deps.clock.now());
      return sessions.map((session) => ({
        handle: sessionHandle(session.tokenHash),
        device: session.device || "A browser",
        createdAt: session.createdAt,
        lastActiveAt: session.lastExtendedAt,
        current: session.tokenHash === currentHash,
      }));
    },

    /** Ends one of the person's other sessions, by its handle. */
    async endSession(actor: Actor, handle: string): Promise<ChangeResult> {
      const sessions = await deps.sessions.listForAccount(actor.id, deps.clock.now());
      const target = sessions.find((session) => sessionHandle(session.tokenHash) === handle);
      if (!target) return refusedWith("That session has already ended.");
      await deps.sessions.delete(target.tokenHash);
      await deps.audit.record({ actor, category: "security", action: "session.ended", target: { type: "account", id: actor.id }, summary: `Ended a session on ${target.device || "a browser"}` });
      return done();
    },

    /** Changes the person's password, keeping this browser signed in and signing out every other. */
    async changePassword(actor: Actor, currentToken: string | undefined, input: ChangePasswordInput): Promise<ChangeResult> {
      // Someone holding a stolen session can't use this form to guess the password either.
      if (!(await deps.signInLimiter.tryConsume(`password:${actor.id}`))) return refusedWith(tooManySignIns);
      const account = await deps.accounts.findById(actor.id);
      if (!account) return refusedWith(accountGone);
      if (!(await deps.passwords.verify(input.currentPassword, account.passwordHash))) {
        return refused({ currentPassword: "That isn't your current password." });
      }
      if (input.newPassword === input.currentPassword) {
        return refused({ newPassword: "Choose a password that's different from your current one." });
      }
      return setOwnPassword(account, input.newPassword, currentToken);
    },

    /**
     * Replaces a temporary password with one the person chooses. Signing in
     * with the temporary password (and their code, if they have an
     * authenticator) proved they have it, so it isn't asked for again.
     */
    async replaceTemporaryPassword(actor: Actor, currentToken: string | undefined, input: ReplaceTemporaryPasswordInput): Promise<ChangeResult> {
      const account = await deps.accounts.findById(actor.id);
      if (!account) return refusedWith(accountGone);
      if (!account.mustChangePassword) {
        return refusedWith("You've already chosen your own password. Reload the page to change it again.");
      }
      if (await deps.passwords.verify(input.newPassword, account.passwordHash)) {
        return refused({ newPassword: "Choose your own password, not the temporary one." });
      }
      return setOwnPassword(account, input.newPassword, currentToken);
    },

    /** Forgets sessions that have ended. Safe to call often (the daily job does). Returns how many went. */
    async pruneExpiredSessions(): Promise<number> {
      return deps.sessions.deleteExpired(deps.clock.now());
    },
  };
}

export type AccountService = ReturnType<typeof createAccountService>;
