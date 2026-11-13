import { z } from "zod";
import { roles } from "@/lib/kernel/actor";

/**
 * What the sign-in, setup, team and password forms accept. The same schemas
 * run in the browser, for instant feedback, and on the server, which always
 * checks again (see parseWith in src/lib/forms/parse.ts). Field names match
 * the form fields, so errors land next to them, and the limits are exported
 * so each form's maxLength matches.
 *
 * Passwords are read as typed: no trimming, since spaces can be part of one.
 */

export const accountLimits = { name: 120, email: 254 } as const;

export const passwordLimits = { min: 10, max: 200 } as const;

/** Setup tokens are long random strings; anything longer than this isn't one. */
export const setupTokenLimit = 500;

/** Email addresses are compared and stored in lower case. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Why a new password won't do for the account with `email`, or null when it's fine. */
export function passwordProblem(password: string, email: string): string | null {
  if (password.length < passwordLimits.min) return `Use at least ${passwordLimits.min} characters.`;
  if (password.length > passwordLimits.max) return `Keep it under ${passwordLimits.max} characters.`;
  if (email && password.trim().toLowerCase() === normalizeEmail(email)) return "Don't use your email address as your password.";
  return null;
}

const emailField = (requiredMessage: string) =>
  z
    .string({ error: requiredMessage })
    .trim()
    .toLowerCase()
    .min(1, requiredMessage)
    .max(accountLimits.email, `Keep it under ${accountLimits.email} characters.`)
    .pipe(z.email("Enter an email address like name@example.com."));

const nameField = (requiredMessage: string) =>
  z
    .string({ error: requiredMessage })
    .trim()
    .min(1, requiredMessage)
    .max(accountLimits.name, `Keep it under ${accountLimits.name} characters.`)
    .transform((name) => name.replace(/\s+/g, " "));

/** A password someone already has: anything they type, as typed. */
const currentPasswordField = (requiredMessage: string) =>
  z.string({ error: requiredMessage }).min(1, requiredMessage).max(passwordLimits.max, "That isn't your current password.");

const newPasswordField = z
  .string({ error: "Choose a password." })
  .min(passwordLimits.min, `Use at least ${passwordLimits.min} characters.`)
  .max(passwordLimits.max, `Keep it under ${passwordLimits.max} characters.`);

const confirmPasswordField = z.string({ error: "Type the password again." }).min(1, "Type the password again.");

const roleField = z.enum(roles, { error: "Choose a role." });

type Issues = { issues: ReadonlyArray<{ path?: ReadonlyArray<PropertyKey> }> };

/**
 * A check across fields that runs once those fields are otherwise fine, even
 * when others aren't: "The passwords don't match" shows up beside a problem
 * with the email address instead of after it's fixed.
 */
function onceFieldsAreValid(...fields: string[]) {
  return (payload: Issues) => payload.issues.every((issue) => !fields.includes(String(issue.path?.[0])));
}

export const signInInput = z.object({
  email: emailField("Enter your email address."),
  password: currentPasswordField("Enter your password."),
});

export type SignInInput = z.output<typeof signInInput>;

/** The first owner's details, with the setup token when the server asks for one. */
export const setupInput = z
  .object({
    name: nameField("Enter your name."),
    email: emailField("Enter your email address."),
    password: newPasswordField,
    confirmPassword: confirmPasswordField,
    setupToken: z.string().trim().max(setupTokenLimit, "That setup code isn't right.").optional().default(""),
  })
  .refine((value) => passwordProblem(value.password, value.email) === null, {
    path: ["password"],
    message: "Don't use your email address as your password.",
    when: onceFieldsAreValid("password", "email"),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords don't match.",
    when: onceFieldsAreValid("password", "confirmPassword"),
  });

export type SetupInput = z.output<typeof setupInput>;

/** Someone joining the team. Their first password is a temporary one the service makes. */
export const addMemberInput = z.object({
  name: nameField("Enter their name."),
  email: emailField("Enter their email address."),
  role: roleField,
});

export type AddMemberInput = z.output<typeof addMemberInput>;

export const changeRoleInput = z.object({ role: roleField });

export type ChangeRoleInput = z.output<typeof changeRoleInput>;

const newPasswordsMatch = {
  path: ["confirmPassword"],
  message: "The passwords don't match.",
  when: onceFieldsAreValid("newPassword", "confirmPassword"),
};

/** Changing your own password: the current one, then the new one twice. */
export const changePasswordInput = z
  .object({
    currentPassword: currentPasswordField("Enter your current password."),
    newPassword: newPasswordField,
    confirmPassword: confirmPasswordField,
  })
  .refine((value) => value.newPassword === value.confirmPassword, newPasswordsMatch);

export type ChangePasswordInput = z.output<typeof changePasswordInput>;

/**
 * Choosing your own password after signing in with a temporary one. The
 * temporary password isn't asked for again: signing in with it proved it.
 */
export const replaceTemporaryPasswordInput = z
  .object({
    newPassword: newPasswordField,
    confirmPassword: confirmPasswordField,
  })
  .refine((value) => value.newPassword === value.confirmPassword, newPasswordsMatch);

export type ReplaceTemporaryPasswordInput = z.output<typeof replaceTemporaryPasswordInput>;

/** The team member an action is bound to. A browser can send any value, so it's checked like any other input. */
export const memberIdInput = z.uuid({ error: "That person isn't on the team any more. Reload the page." });

/** Turning someone's access on ("active") or off ("disabled"). */
export const accountStatusInput = z.enum(["active", "disabled"]);

/** An authenticator code (six digits) or a recovery code ("kd7m3-xqpv9"), as typed. */
export const mfaCodeField = z
  .string({ error: "Enter the code from your authenticator app." })
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(1, "Enter the code from your authenticator app.")
      .regex(/^(\d{3}\s?\d{3}|[a-zA-Z0-9]{5}-?[a-zA-Z0-9]{5})$/, "Enter the 6-digit code from your app, or one of your recovery codes."),
  );

export const mfaCodeInput = z.object({ code: mfaCodeField });

export type MfaCodeInput = z.output<typeof mfaCodeInput>;

/** Re-entering the password (and the code, when an authenticator is set up) before a sensitive change. */
export const stepUpInput = z.object({
  password: currentPasswordField("Enter your password."),
  code: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? ""),
});

export type StepUpInput = z.output<typeof stepUpInput>;

/** Asking for an owner's password reset link. */
export const forgotPasswordInput = z.object({ email: emailField("Enter your email address.") });

export type ForgotPasswordInput = z.output<typeof forgotPasswordInput>;

/** Choosing a new password from a reset link. */
export const resetPasswordInput = z
  .object({
    token: z.string({ error: "This link isn't complete. Ask for a new one." }).regex(/^[A-Za-z0-9_-]{43}$/, "This link isn't complete. Ask for a new one."),
    newPassword: newPasswordField,
    confirmPassword: confirmPasswordField,
  })
  .refine((value) => value.newPassword === value.confirmPassword, newPasswordsMatch);

export type ResetPasswordInput = z.output<typeof resetPasswordInput>;

/** A session on the account page, by its public handle. */
export const sessionHandleInput = z.string().regex(/^[a-f0-9]{16}$/, { error: "That session has already ended. Reload the page." });

/** A single-use link's token, from its URL. */
export const linkTokenInput = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
