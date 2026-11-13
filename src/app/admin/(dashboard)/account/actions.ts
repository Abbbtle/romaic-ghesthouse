"use server";

import { refresh } from "next/cache";
import { anySignedInRole, type DashboardRequirement } from "@/lib/accounts/access";
import { sessionHandleInput } from "@/lib/accounts/input";
import { failedState, formStateOf, savedState, type FormState } from "@/lib/forms/form-state";
import { accountServices } from "@/server/accounts";
import { dashboardAction, dashboardFormAction } from "@/server/admin-actions";

/*
 * The signed-in person's own account: their email, authenticator, recovery
 * codes and sessions. Each action checks the session itself; the ones that
 * change how someone signs in also need a recent password-and-code check.
 * Every role has an account, so none needs a permission.
 */

const changeHowYouSignIn: DashboardRequirement = { ...anySignedInRole, stepUp: true };

/** Emails a link that confirms the person's address. */
export const sendEmailConfirmation = dashboardFormAction(async (actor): Promise<FormState> => {
  const result = await accountServices().emailLinks.requestEmailVerification(actor);
  if (!result.ok) return formStateOf(result);
  return result.sent ? savedState("Sent. Open the link in the email within 24 hours.") : failedState("Email isn't set up yet, so the link couldn't be sent. Ask Weberu.");
}, anySignedInRole);

/** Ends one of the person's other sessions. */
export const endSession = dashboardAction(async (actor, handle: unknown): Promise<FormState> => {
  const parsed = sessionHandleInput.safeParse(handle);
  if (!parsed.success) return failedState("That session has already ended. Reload the page.");
  const result = await accountServices().accounts.endSession(actor, parsed.data);
  if (result.ok) refresh();
  return formStateOf(result, "Session ended");
}, anySignedInRole);

/** New recovery codes, shown once; the old ones stop working. */
export const makeRecoveryCodes = dashboardAction(
  async (actor): Promise<{ status: "made"; recoveryCodes: string[] } | { status: "failed"; message: string }> => {
    const result = await accountServices().accounts.regenerateRecoveryCodes(actor);
    if (!result.ok) return { status: "failed", message: Object.values(result.errors)[0] ?? "That didn't work." };
    refresh();
    return { status: "made", recoveryCodes: result.recoveryCodes };
  },
  changeHowYouSignIn,
);

/** Turns off an authenticator, for staff only (their role doesn't need one). */
export const turnOffAuthenticator = dashboardAction(
  async (actor): Promise<FormState> => {
    const result = await accountServices().accounts.disableMfa(actor);
    if (result.ok) refresh();
    return formStateOf(result, "Authenticator turned off");
  },
  changeHowYouSignIn,
);
