import type { AuditRecorder } from "@/lib/kernel/audit";
import type { Clock, IdGenerator } from "@/lib/kernel/ports";
import { tooManyMessage, type RateLimiter } from "@/lib/kernel/rate-limit";
import { done, refused, refusedWith, type ChangeResult } from "@/lib/kernel/result";
import type { SetupInput } from "./input";
import type { AccountStore, PasswordHasher, RequestContext, SecretGenerator, SessionStore, TokenHasher } from "./ports";
import { setupLimit } from "./rate-limits";
import { startSession, type NewSession } from "./sessions";

/**
 * Where first-run setup stands: done (an account exists), waiting for the
 * setup token, open to anyone (development), or locked until a token is set
 * on the server.
 */
export type SetupStatus = "done" | "needs-token" | "open" | "locked";

export type SetupServiceDependencies = {
  accounts: AccountStore;
  sessions: SessionStore;
  passwords: PasswordHasher;
  tokens: TokenHasher;
  secrets: SecretGenerator;
  ids: IdGenerator;
  clock: Clock;
  /** Counts setup attempts per visitor, so the setup token can't be guessed by trying. */
  limiter: RateLimiter;
  audit: AuditRecorder;
  /**
   * With a token (ADMIN_SETUP_TOKEN), whoever sets up must enter it, so a
   * stranger can't claim a freshly deployed site. Without one, setup is only
   * open when `openWithoutToken` (in development).
   */
  setup: { token: string | null; openWithoutToken: boolean };
};

const alreadyDone = "Setup is already done. Sign in instead.";

/**
 * Creates the first account, an owner, on a fresh site. The new owner's
 * session still has to set up an authenticator before the dashboard opens.
 */
export function createSetupService(deps: SetupServiceDependencies) {
  const status = async (): Promise<SetupStatus> => {
    if (await deps.accounts.anyExist()) return "done";
    if (deps.setup.token) return "needs-token";
    return deps.setup.openWithoutToken ? "open" : "locked";
  };

  return {
    status,

    /** Creates the first owner and signs them in. `visitorKey` identifies the browser for the attempt limit. */
    async setUp(input: SetupInput, { visitorKey, device }: RequestContext): Promise<ChangeResult<{ session: NewSession }>> {
      const current = await status();
      if (current === "done") return refusedWith(alreadyDone);
      if (current === "locked") return refusedWith("Setup is locked until a setup code is set on the server.");
      if (!(await deps.limiter.tryConsume(`visitor:${visitorKey}`))) {
        return refusedWith(tooManyMessage(setupLimit));
      }
      if (current === "needs-token") {
        if (!input.setupToken) return refused({ setupToken: "Enter the setup code." });
        // Comparing hashes in constant time keeps the comparison from leaking how much of the code matched.
        if (!deps.tokens.matches(input.setupToken, deps.tokens.hash(deps.setup.token ?? ""))) {
          return refused({ setupToken: "That setup code isn't right." });
        }
      }

      const now = deps.clock.now();
      const id = deps.ids.newId();
      // Checked again as the account is created: someone may have finished setup while the password was hashing.
      const created = await deps.accounts.createFirstOwner({
        id,
        email: input.email,
        name: input.name,
        role: "owner",
        status: "active",
        passwordHash: await deps.passwords.hash(input.password),
        mustChangePassword: false,
        temporaryPasswordExpiresAt: null,
        emailVerifiedAt: null,
        createdAt: now,
        updatedAt: now,
        lastSignedInAt: null,
      });
      if (!created) return refusedWith(alreadyDone);
      await deps.audit.record({ actor: { id, role: "owner", name: input.name }, category: "team", action: "team.first-owner", target: { type: "account", id }, summary: `Set up the dashboard as the first owner`, ipHash: visitorKey });
      return done({ session: await startSession(deps, { id, role: "owner" }, { mfaVerified: false, device }) });
    },
  };
}

export type SetupService = ReturnType<typeof createSetupService>;
