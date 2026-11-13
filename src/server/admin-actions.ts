import "server-only";
import { unstable_rethrow } from "next/navigation";
import { createDashboardActionGuards } from "./admin-action-guards";
import { currentSignIn } from "./admin-session";
import { clock, reportError } from "./infrastructure";

/*
 * The wrappers every dashboard server action goes through (see
 * ./admin-action-guards.ts for what they check): over this request's
 * session, letting Next.js's redirect() and notFound() through.
 *
 *   export const saveHours = dashboardFormAction(async (actor, formData) => { … }, { permission: "settings:booking-rules" });
 *   export const endSession = dashboardAction(async (actor, handle: unknown) => { … }, anySignedInRole);
 *   export const removeMember = dashboardAction(async (actor, memberId: unknown) => { … }, { permission: "team:manage-all", stepUp: true });
 */

const guards = createDashboardActionGuards({ currentSignIn, rethrowControlFlow: unstable_rethrow, reportError, clock });

/** A dashboard form's server action: `dashboardFormAction(handler, requirement)` → a FormAction for useActionState. */
export const dashboardFormAction = guards.dashboardFormAction;

/** A form action on the person's own account, open while a temporary password waits to be replaced. */
export const signedInFormAction = guards.signedInFormAction;

/** A dashboard server action called with arguments: `dashboardAction(handler, requirement)` → (...args) → result, signed-out, step-up or failed. */
export const dashboardAction = guards.dashboardAction;

export type { ActionFailure, SignedOut, StepUpDue } from "./admin-action-guards";
