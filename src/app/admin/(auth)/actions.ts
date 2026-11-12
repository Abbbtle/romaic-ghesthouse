"use server";

import { redirect } from "next/navigation";
import { nextStepFor, type NextStep } from "@/lib/accounts/access";
import {
  changePasswordInput,
  forgotPasswordInput,
  linkTokenInput,
  mfaCodeInput,
  replaceTemporaryPasswordInput,
  resetPasswordInput,
  setupInput,
  signInInput,
  stepUpInput,
} from "@/lib/accounts/input";
import { failedState, formStateOf, invalidState, savedState, type FormState } from "@/lib/forms/form-state";
import { parseWith } from "@/lib/forms/parse";
import { accountServices } from "@/server/accounts";
import { signedInFormAction } from "@/server/admin-actions";
import { adminPaths, safeAdminDestination } from "@/server/admin-paths";
import { clearSessionCookie, currentDevice, currentSessionToken, currentSignIn, setSessionCookie } from "@/server/admin-session";
import { currentVisitorKey } from "@/server/visitor";

/*
 * Signing in (password, then the authenticator step), setting up an
 * authenticator, first-run setup, passwords, emailed links, confirming a
 * sensitive change, and signing out. Every action reads its form with the
 * same schema the browser checked it with, since anyone can post anything
 * here.
 */

/** Where each sign-in step leads. */
function pathFor(next: NextStep, destination: string): string {
  switch (next) {
    case "mfa":
      return `${adminPaths.mfa}?${new URLSearchParams({ next: destination })}`;
    case "change-password":
      return adminPaths.changePassword;
    case "mfa-setup":
      return adminPaths.mfaSetup;
    case "dashboard":
      return destination;
  }
}

/** Checks an email address and password, then goes to the next step of signing in. */
export async function signIn(_previous: FormState, formData: FormData): Promise<FormState> {
  const input = parseWith(signInInput, Object.fromEntries(formData));
  if (!input.ok) return invalidState(input.errors);
  const result = await accountServices().accounts.signIn(input.value, { visitorKey: await currentVisitorKey(), device: await currentDevice() });
  if (!result.ok) return invalidState(result.errors);
  await setSessionCookie(result.session);
  redirect(pathFor(result.next, safeAdminDestination(formData.get("next"))));
}

/** The authenticator step: a code from the app, or a recovery code. */
export async function verifyMfa(_previous: FormState, formData: FormData): Promise<FormState> {
  const input = parseWith(mfaCodeInput, Object.fromEntries(formData));
  if (!input.ok) return invalidState(input.errors);
  const result = await accountServices().accounts.verifyMfa(await currentSessionToken(), input.value.code, { device: await currentDevice() });
  if (!result.ok) return invalidState(result.errors);
  await setSessionCookie(result.session);
  const destination = safeAdminDestination(formData.get("next"));
  redirect(result.usedRecoveryCode && result.next === "dashboard" ? `${adminPaths.home}/account?notice=recovery-code-used` : pathFor(result.next, destination));
}

/** What confirming an authenticator reports: the recovery codes, shown once. */
export type MfaSetupState = { status: "idle" } | { status: "invalid"; message: string } | { status: "confirmed"; recoveryCodes: string[] };

/** Confirms a new authenticator with its first code, signing this session's last step. */
export async function confirmMfaSetup(_previous: MfaSetupState, formData: FormData): Promise<MfaSetupState> {
  const input = parseWith(mfaCodeInput, Object.fromEntries(formData));
  if (!input.ok) return { status: "invalid", message: input.errors.code ?? "Enter the 6-digit code from your app." };
  const result = await accountServices().accounts.confirmMfaEnrolment(await currentSessionToken(), input.value.code, { device: await currentDevice() });
  if (!result.ok) return { status: "invalid", message: result.errors.code ?? result.errors.form ?? "That code didn't work." };
  await setSessionCookie(result.session);
  return { status: "confirmed", recoveryCodes: result.recoveryCodes };
}

/** Creates the first owner on a fresh site and signs them in; they set up an authenticator next. */
export async function setUp(_previous: FormState, formData: FormData): Promise<FormState> {
  const input = parseWith(setupInput, Object.fromEntries(formData));
  if (!input.ok) return invalidState(input.errors);
  const result = await accountServices().setup.setUp(input.value, { visitorKey: await currentVisitorKey(), device: await currentDevice() });
  if (!result.ok) return invalidState(result.errors);
  await setSessionCookie(result.session);
  redirect(adminPaths.mfaSetup);
}

/**
 * Changes the signed-in person's password, keeping this browser signed in
 * and signing out every other. Someone with a temporary password chooses
 * their own without retyping the temporary one, then goes on.
 */
export const changePassword = signedInFormAction(async ({ actor, mustChangePassword, mfaDue, mfaEnrolmentDue }, formData) => {
  if (mfaDue) return failedState("Enter the code from your authenticator app first. Reload the page to do it.");
  const { accounts } = accountServices();
  const token = await currentSessionToken();
  const fields = Object.fromEntries(formData);
  if (mustChangePassword) {
    const input = parseWith(replaceTemporaryPasswordInput, fields);
    if (!input.ok) return invalidState(input.errors);
    const result = await accounts.replaceTemporaryPassword(actor, token, input.value);
    if (!result.ok) return invalidState(result.errors);
    redirect(mfaEnrolmentDue ? adminPaths.mfaSetup : adminPaths.home);
  }
  const input = parseWith(changePasswordInput, fields);
  if (!input.ok) return invalidState(input.errors);
  return formStateOf(await accounts.changePassword(actor, token, input.value), "Password changed. You've been signed out on your other devices.");
});

/** Owners: emails a reset link to a verified address. Always answers the same way. */
export async function requestPasswordReset(_previous: FormState, formData: FormData): Promise<FormState> {
  const input = parseWith(forgotPasswordInput, Object.fromEntries(formData));
  if (!input.ok) return invalidState(input.errors);
  const { message } = await accountServices().emailLinks.requestPasswordReset(input.value.email, { visitorKey: await currentVisitorKey() });
  return savedState(message);
}

/** Sets a new password from a reset link, then sends the owner to sign in (their authenticator still applies). */
export async function resetPassword(_previous: FormState, formData: FormData): Promise<FormState> {
  const input = parseWith(resetPasswordInput, Object.fromEntries(formData));
  if (!input.ok) return invalidState(input.errors);
  const result = await accountServices().emailLinks.resetPassword(input.value);
  if (!result.ok) return invalidState(result.errors);
  await clearSessionCookie();
  redirect(`${adminPaths.signIn}?notice=password-reset`);
}

/** Confirms an email address from its link (a button press, so link scanners can't use it up). */
export async function verifyEmail(_previous: FormState, formData: FormData): Promise<FormState> {
  const token = linkTokenInput.safeParse(formData.get("token"));
  if (!token.success) return failedState("This link isn't complete. Ask for a new one from your account page.");
  return formStateOf(await accountServices().emailLinks.verifyEmail(token.data), "Email address confirmed. Thank you.");
}

/** Confirms the password (and code) before a sensitive change, then returns to where it was asked for. */
export const confirmIdentity = signedInFormAction(async (_signedIn, formData) => {
  const input = parseWith(stepUpInput, Object.fromEntries(formData));
  if (!input.ok) return invalidState(input.errors);
  const result = await accountServices().accounts.stepUp(await currentSessionToken(), input.value);
  if (!result.ok) return invalidState(result.errors);
  redirect(safeAdminDestination(formData.get("next")));
});

/** Signs this browser out. */
export async function signOut(): Promise<void> {
  await accountServices().accounts.signOut(await currentSessionToken());
  await clearSessionCookie();
  redirect(adminPaths.signIn);
}

/**
 * Signs the person out on every device, this one included: for a lost phone.
 * Only once every sign-in step is done, so a password alone can't end the
 * owner's other sessions; partway through, it signs out this browser only.
 */
export async function signOutEverywhere(): Promise<void> {
  const signedIn = await currentSignIn();
  if (signedIn && nextStepFor(signedIn) === "dashboard") await accountServices().accounts.signOutEverywhere(signedIn.actor);
  else await accountServices().accounts.signOut(await currentSessionToken());
  await clearSessionCookie();
  redirect(adminPaths.signIn);
}
