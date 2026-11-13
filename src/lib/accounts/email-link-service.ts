import type { AuditRecorder } from "@/lib/kernel/audit";
import type { EmailSender } from "@/lib/kernel/email";
import type { Actor } from "@/lib/kernel/actor";
import { resetsPasswordByEmail } from "./access";
import type { Clock } from "@/lib/kernel/ports";
import { tooManyMessage, type RateLimiter } from "@/lib/kernel/rate-limit";
import { done, refused, refusedWith, type ChangeResult } from "@/lib/kernel/result";
import { passwordProblem, type ResetPasswordInput } from "./input";
import type { AccountStore, AccountTokenStore, PasswordHasher, RequestContext, SecretGenerator, TokenHasher } from "./ports";
import { emailLinkLimit } from "./rate-limits";

/**
 * Single-use links sent by email (roles.md, "Owner recovery"):
 *
 * - **Email verification.** Anyone signed in can ask for a link to their own
 *   address. Following it marks the address verified, but only while it's
 *   still the account's address.
 * - **Password reset, owners only.** "Forgot password" sends a link valid
 *   for 30 minutes to an owner's **verified** address. Setting a new password
 *   signs out every session; the authenticator stays, so the next sign-in
 *   still asks for a code. Sales and staff recover through an owner or admin
 *   (temporary passwords), since they may have no email.
 *
 * The request always answers the same way, whether or not a link was sent,
 * so the form doesn't reveal which addresses have accounts. Without an email
 * sender (development, or before a provider is approved), links are logged
 * by the console sender instead.
 */

export const resetLinkLifetimeMs = 30 * 60 * 1000;
export const verificationLinkLifetimeMs = 24 * 60 * 60 * 1000;

export type EmailLinkServiceDependencies = {
  accounts: AccountStore;
  tokens: AccountTokenStore;
  hasher: TokenHasher;
  secrets: Pick<SecretGenerator, "linkToken">;
  passwords: PasswordHasher;
  email: EmailSender | null;
  clock: Clock;
  limiter: RateLimiter;
  audit: AuditRecorder;
  /** Full addresses for the dashboard's link pages. */
  links: { resetPassword(token: string): string; verifyEmail(token: string): string };
  businessName: string;
};

/** What the forgot-password form says, every time. */
export const resetRequestedMessage =
  "If that address belongs to an owner and has been verified, we've emailed a link to reset the password. It works for 30 minutes.";

export function createEmailLinkService(deps: EmailLinkServiceDependencies) {
  const send = async (to: string, subject: string, text: string) => {
    if (!deps.email) return false;
    const delivery = await deps.email.send({ to, subject, text });
    return delivery.ok;
  };

  return {
    /** Sends an owner a reset link, when the address is theirs and verified. Always answers the same. */
    async requestPasswordReset(email: string, { visitorKey }: Pick<RequestContext, "visitorKey">): Promise<{ message: string }> {
      const allowed = await Promise.all([`reset-email:${email}`, `reset-visitor:${visitorKey}`].map((key) => deps.limiter.tryConsume(key)));
      if (!allowed.every(Boolean)) return { message: resetRequestedMessage };
      const account = await deps.accounts.findByEmail(email);
      if (!account || !resetsPasswordByEmail(account.role) || account.status !== "active" || !account.emailVerifiedAt) {
        return { message: resetRequestedMessage };
      }
      const now = deps.clock.now();
      const token = deps.secrets.linkToken();
      await deps.tokens.issue({
        tokenHash: deps.hasher.hash(token),
        accountId: account.id,
        purpose: "password-reset",
        email: account.email,
        createdAt: now,
        expiresAt: new Date(now.getTime() + resetLinkLifetimeMs),
      });
      const sent = await send(
        account.email,
        `Reset your ${deps.businessName} dashboard password`,
        [
          `Hi ${account.name},`,
          "",
          "Someone asked to reset the password for your dashboard account. If it was you, open this link within 30 minutes:",
          deps.links.resetPassword(token),
          "",
          "You'll still need the code from your authenticator app when you next sign in.",
          "If you didn't ask for this, ignore this email: your password hasn't changed.",
        ].join("\n"),
      );
      await deps.audit.record({
        actor: null,
        category: "security",
        action: "password-reset.requested",
        target: { type: "account", id: account.id },
        summary: sent ? `Password reset link emailed to ${account.name}` : `Password reset link for ${account.name} could not be emailed`,
        ipHash: visitorKey,
      });
      return { message: resetRequestedMessage };
    },

    /** Sets a new password from a reset link, signing out every session. */
    async resetPassword(input: ResetPasswordInput): Promise<ChangeResult> {
      const now = deps.clock.now();
      const used = await deps.tokens.consume(deps.hasher.hash(input.token), "password-reset", now);
      if (!used) return refusedWith("This reset link has expired or was already used. Ask for a new one.");
      const account = await deps.accounts.findById(used.accountId);
      if (!account || account.email !== used.email || account.status !== "active") {
        return refusedWith("This reset link no longer works. Ask for a new one.");
      }
      const problem = passwordProblem(input.newPassword, account.email);
      if (problem) return refused({ newPassword: problem });
      const changed = await deps.accounts.setPassword(account.id, {
        passwordHash: await deps.passwords.hash(input.newPassword),
        temporary: null,
        at: now,
        keepSessionHash: null,
      });
      if (!changed) return refusedWith("This reset link no longer works. Ask for a new one.");
      await deps.audit.record({
        actor: { id: account.id, role: account.role, name: account.name },
        category: "security",
        action: "password-reset.completed",
        target: { type: "account", id: account.id },
        summary: "Reset their password from an emailed link",
      });
      await send(
        account.email,
        `Your ${deps.businessName} dashboard password was changed`,
        [`Hi ${account.name},`, "", "Your dashboard password was just reset from an emailed link, and every session was signed out.", "If this wasn't you, contact Weberu straight away."].join("\n"),
      );
      return done();
    },

    /** Emails the signed-in person a link proving their address. */
    async requestEmailVerification(actor: Actor): Promise<ChangeResult<{ sent: boolean }>> {
      if (!(await deps.limiter.tryConsume(`verify:${actor.id}`))) return refusedWith(tooManyMessage(emailLinkLimit, "emails"));
      const account = await deps.accounts.findById(actor.id);
      if (!account) return refusedWith("Your account no longer exists.");
      if (account.emailVerifiedAt) return done({ sent: false });
      const now = deps.clock.now();
      const token = deps.secrets.linkToken();
      await deps.tokens.issue({
        tokenHash: deps.hasher.hash(token),
        accountId: account.id,
        purpose: "email-verification",
        email: account.email,
        createdAt: now,
        expiresAt: new Date(now.getTime() + verificationLinkLifetimeMs),
      });
      const sent = await send(
        account.email,
        `Confirm your email for the ${deps.businessName} dashboard`,
        [`Hi ${account.name},`, "", "Open this link within 24 hours to confirm this is your email address:", deps.links.verifyEmail(token)].join("\n"),
      );
      return done({ sent });
    },

    /** Marks an address verified from its link. */
    async verifyEmail(token: string): Promise<ChangeResult> {
      const now = deps.clock.now();
      const used = await deps.tokens.consume(deps.hasher.hash(token), "email-verification", now);
      if (!used) return refusedWith("This link has expired or was already used. Ask for a new one from your account page.");
      const marked = await deps.accounts.markEmailVerified(used.accountId, { email: used.email, at: now });
      if (!marked) return refusedWith("Your email address has changed since this link was sent. Ask for a new one.");
      const account = await deps.accounts.findById(used.accountId);
      if (account) {
        await deps.audit.record({ actor: { id: account.id, role: account.role, name: account.name }, category: "security", action: "email.verified", target: { type: "account", id: account.id }, summary: "Confirmed their email address" });
      }
      return done();
    },

    /** Forgets expired links (the daily job). */
    async pruneExpiredLinks(): Promise<number> {
      return deps.tokens.deleteExpired(deps.clock.now());
    },
  };
}

export type EmailLinkService = ReturnType<typeof createEmailLinkService>;
