import { dashboardAccess, NotAllowedError, type DashboardAccess, type DashboardRequirement, type SignInStep } from "@/lib/accounts/access";
import type { SignedIn } from "@/lib/accounts/account-service";
import { failedState, type FormAction, type FormState } from "@/lib/forms/form-state";
import type { Actor } from "@/lib/kernel/actor";
import type { Clock } from "@/lib/kernel/ports";

/**
 * The checks every dashboard server action goes through, as a factory over
 * what they need, so they can be tested without a request. ./admin-actions.ts
 * makes the ones the site uses, over the request's session cookie and
 * Next.js's unstable_rethrow.
 *
 * Server actions can be called directly, with any arguments, so each one
 * checks the session, the permission and (for sensitive changes) a recent
 * password-and-code confirmation for itself, rather than trusting that the
 * page showing it did. Nobody is redirected: a form keeps what they typed
 * and says what to do, and an action called from a client component gets a
 * status to handle.
 */

/** What a dashboard action answers when nobody, or someone partway through signing in, calls it. */
export type SignedOut = { status: "signed-out" };

/** What a dashboard action answers when a sensitive change needs the password and code again first. */
export type StepUpDue = { status: "step-up" };

/** What a dashboard action answers when it fails: the role falls short, or something unexpected went wrong. */
export type ActionFailure = { status: "failed"; message: string };

export type DashboardActionGuardDependencies = {
  /** Who this request's session cookie belongs to, checked against the database; null when nobody. */
  currentSignIn: () => Promise<SignedIn | null>;
  /**
   * Throws `error` again when it's how Next.js changes course (redirect(),
   * notFound()), which must reach Next.js, not become a failure message:
   * unstable_rethrow from next/navigation.
   */
  rethrowControlFlow: (error: unknown) => void;
  /** Logs an unexpected error without the personal data it might carry. */
  reportError: (description: string, error: unknown) => void;
  /** For the step-up window. */
  clock: Clock;
};

const signedOutMessage = "You've been signed out. Sign in again in another tab, then try again: what you typed is still here.";
const unexpectedMessage = "Something went wrong, so nothing was saved. Try again in a moment.";
export const stepUpMessage = "For your security, confirm your password and code first, then try again.";

const unfinishedSignInMessages: Record<SignInStep, string> = {
  mfa: "Enter the code from your authenticator app first. Reload the page to do it.",
  "change-password": "Choose your own password before making changes. Reload the page to do it.",
  "mfa-setup": "Set up your authenticator app before making changes. Reload the page to do it.",
};

function messageFor(access: Exclude<DashboardAccess, { status: "allowed" }>): string {
  switch (access.status) {
    case "signed-out":
      return signedOutMessage;
    case "sign-in-unfinished":
      return unfinishedSignInMessages[access.step];
    case "not-allowed":
      return new NotAllowedError(access.permission).message;
    case "step-up-due":
      return stepUpMessage;
  }
}

export function createDashboardActionGuards(deps: DashboardActionGuardDependencies) {
  /**
   * Runs an action's work, the session check included, turning an error it
   * didn't expect (the database being unreachable, say) into a failure
   * message, logged without personal data, instead of a crash. Next.js's own
   * control-flow throws pass through.
   */
  const guarded = async <Result>(work: () => Promise<Result>, whenFailed: (message: string) => Result): Promise<Result> => {
    try {
      return await work();
    } catch (error) {
      deps.rethrowControlFlow(error);
      // A service refusing an actor whose role changed since the check.
      if (error instanceof NotAllowedError) return whenFailed(error.message);
      deps.reportError("A dashboard action failed", error);
      return whenFailed(unexpectedMessage);
    }
  };

  const accessFor = async (requirement: DashboardRequirement): Promise<DashboardAccess> => dashboardAccess(await deps.currentSignIn(), requirement, deps.clock.now());

  return {
    /**
     * A dashboard form's server action, for useActionState: (previous state,
     * form data) → the form's new state. `requirement` is what the action
     * asks (anySignedInRole when every role may use it).
     */
    dashboardFormAction(handler: (actor: Actor, formData: FormData) => Promise<FormState>, requirement: DashboardRequirement): FormAction {
      return (_previous, formData) =>
        guarded(async () => {
          const access = await accessFor(requirement);
          return access.status === "allowed" ? handler(access.actor, formData) : failedState(messageFor(access));
        }, failedState);
    },

    /**
     * A form action on the person's own sign-in, open at any step of signing
     * in (entering a code, choosing a password, setting up an authenticator).
     * The handler gets the whole sign-in.
     */
    signedInFormAction(handler: (signedIn: SignedIn, formData: FormData) => Promise<FormState>): FormAction {
      return (_previous, formData) =>
        guarded(async () => {
          const signedIn = await deps.currentSignIn();
          return signedIn ? handler(signedIn, formData) : failedState(signedOutMessage);
        }, failedState);
    },

    /**
     * A dashboard server action called with arguments, such as a button's
     * bound record id. Every argument arrives from the browser, so the
     * handler checks each one (with the cores' zod schemas) before using it.
     */
    dashboardAction<Args extends unknown[], Result>(
      handler: (actor: Actor, ...args: Args) => Promise<Result>,
      requirement: DashboardRequirement,
    ): (...args: Args) => Promise<Result | SignedOut | StepUpDue | ActionFailure> {
      return (...args) =>
        guarded<Result | SignedOut | StepUpDue | ActionFailure>(
          async () => {
            const access = await accessFor(requirement);
            if (access.status === "allowed") return handler(access.actor, ...args);
            if (access.status === "step-up-due") return { status: "step-up" };
            if (access.status === "not-allowed") return { status: "failed", message: messageFor(access) };
            return { status: "signed-out" };
          },
          (message) => ({ status: "failed", message }),
        );
    },
  };
}

export type DashboardActionGuards = ReturnType<typeof createDashboardActionGuards>;
