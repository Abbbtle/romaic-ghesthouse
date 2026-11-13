import { memoryAuditRecorder } from "@/lib/kernel/audit";
import type { Role } from "@/lib/kernel/actor";
import type { EmailMessage, EmailSender } from "@/lib/kernel/email";
import type { FieldCipher } from "@/lib/kernel/ports";
import { createAccountService } from "../account-service";
import { createEmailLinkService } from "../email-link-service";
import type { Account } from "../ports";
import { createSetupService } from "../setup-service";
import { createTeamService } from "../team-service";
import { fakeTotp, memoryAccountStores, movableClock, plainCipher, plainPasswords, plainTokens, sequentialSecrets, unlimited, uuidIds } from "./fakes";

/**
 * Every account service over one set of in-memory stores, with fakes for
 * time, ids, secrets, authenticator codes and email: what the account tests
 * share. `addAccount` puts someone on the team directly.
 */
export function accountHarness(options: { signInLimiter?: typeof unlimited; mfaLimiter?: typeof unlimited; email?: boolean; cipher?: FieldCipher } = {}) {
  const stores = memoryAccountStores();
  const clock = movableClock("2026-11-12T08:00:00.000Z");
  const ids = uuidIds();
  const secrets = sequentialSecrets();
  const totp = fakeTotp();
  const audit = memoryAuditRecorder();
  const sent: EmailMessage[] = [];
  const email: EmailSender | null =
    options.email === false
      ? null
      : {
          async send(message) {
            sent.push(message);
            return { ok: true };
          },
        };

  const accounts = createAccountService({
    ...stores,
    passwords: plainPasswords,
    tokens: plainTokens,
    secrets,
    totp,
    cipher: options.cipher ?? plainCipher,
    clock,
    audit,
    signInLimiter: options.signInLimiter ?? unlimited,
    mfaLimiter: options.mfaLimiter ?? unlimited,
    issuer: "Romaic Guesthouse",
  });
  const team = createTeamService({ ...stores, passwords: plainPasswords, secrets, ids, clock, audit });
  const setup = createSetupService({ ...stores, passwords: plainPasswords, tokens: plainTokens, secrets, ids, clock, audit, limiter: unlimited, setup: { token: null, openWithoutToken: true } });
  const emailLinks = createEmailLinkService({
    accounts: stores.accounts,
    tokens: stores.tokens,
    hasher: plainTokens,
    secrets,
    passwords: plainPasswords,
    email,
    clock,
    limiter: unlimited,
    audit,
    links: { resetPassword: (token) => `https://site.test/admin/reset-password?token=${token}`, verifyEmail: (token) => `https://site.test/admin/verify-email?token=${token}` },
    businessName: "Romaic Guesthouse",
  });

  let count = 0;
  /** Puts someone on the team: active, password "a long passphrase" unless overridden. */
  const addAccount = async (role: Role, overrides: Partial<Account> = {}): Promise<Account> => {
    count++;
    const now = clock.now();
    const account: Account = {
      id: `00000000-0000-4000-8000-${String(900 + count).padStart(12, "0")}`,
      email: `${role}${count}@example.com`,
      name: `${role[0]!.toUpperCase()}${role.slice(1)} ${count}`,
      role,
      status: "active",
      passwordHash: "plain:a long passphrase",
      mustChangePassword: false,
      temporaryPasswordExpiresAt: null,
      emailVerifiedAt: null,
      createdAt: now,
      updatedAt: now,
      lastSignedInAt: null,
      ...overrides,
    };
    await stores.accounts.create(account);
    return account;
  };

  /** Signs someone in with their password and, when they have one, their authenticator; returns the session token. */
  const signInFully = async (account: Account, password = "a long passphrase"): Promise<string> => {
    const result = await accounts.signIn({ email: account.email, password }, { visitorKey: "visitor", device: "Safari on iPhone" });
    if (!result.ok) throw new Error(`sign-in failed: ${JSON.stringify(result.errors)}`);
    let token = result.session.token;
    if (result.next === "mfa") {
      const stored = await stores.mfa.find(account.id);
      if (!stored) throw new Error("no authenticator");
      const secret = plainCipher.decrypt(stored.secretCiphertext, `mfa-totp:${account.id}`);
      clock.advance(30_000);
      const verified = await accounts.verifyMfa(token, totp.codeAt(secret, clock.now()), { device: "Safari on iPhone" });
      if (!verified.ok) throw new Error(`mfa failed: ${JSON.stringify(verified.errors)}`);
      token = verified.session.token;
    }
    return token;
  };

  /** Sets up an authenticator for someone already signed in with `token`; returns the new token and the recovery codes. */
  const enrol = async (token: string, accountId: string) => {
    const started = await accounts.beginMfaEnrolment(token);
    if (!started.ok) throw new Error(`enrolment failed: ${JSON.stringify(started.errors)}`);
    const confirmed = await accounts.confirmMfaEnrolment(token, totp.codeAt(started.secret, clock.now()), { device: "Safari on iPhone" });
    if (!confirmed.ok) throw new Error(`confirm failed: ${JSON.stringify(confirmed.errors)}`);
    void accountId;
    return { token: confirmed.session.token, recoveryCodes: confirmed.recoveryCodes, secret: started.secret };
  };

  return { stores, clock, ids, secrets, totp, audit, sent, accounts, team, setup, emailLinks, addAccount, signInFully, enrol };
}
