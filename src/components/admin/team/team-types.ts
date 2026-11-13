import type { AccountStatus } from "@/lib/accounts/ports";
import type { FormState } from "@/lib/forms/form-state";
import type { Role } from "@/lib/kernel/actor";
import type { FieldErrors } from "@/lib/kernel/result";

/** Someone on the team, as the team page lists them (worked out on the server). */
export type TeamRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Turned off: can't sign in, record kept. */
  disabled: boolean;
  /** Still on a temporary password someone set. */
  temporaryPassword: boolean;
  /** Has an authenticator app set up. */
  mfaEnabled: boolean;
  /** "Today at 08:15", or "Never". */
  lastSignedIn: string;
  /** The person looking at the page: their own access isn't theirs to change. */
  you: boolean;
  /** What the person looking may do about this member. */
  can: { resetPassword: boolean; setStatus: boolean; changeRole: boolean; resetMfa: boolean; remove: boolean };
};

/** What a dashboard action answers when the session has gone, or a sensitive change needs the password again. */
export type SignedOut = { status: "signed-out" };
export type StepUpDue = { status: "step-up" };

export type AddMemberResult =
  | { status: "added"; name: string; temporaryPassword: string }
  | { status: "invalid"; errors: FieldErrors }
  | { status: "failed"; message: string }
  | SignedOut
  | StepUpDue;

export type ResetPasswordResult = { status: "reset"; temporaryPassword: string } | { status: "failed"; message: string } | SignedOut | StepUpDue;

/** The team page's server actions, each checking the session, permission, step-up and its arguments again. */
export type TeamActions = {
  /** Adds someone from the add form's fields (name, email, role). */
  add: (data: FormData) => Promise<AddMemberResult>;
  changeRole: (memberId: string, role: Role) => Promise<FormState | SignedOut | StepUpDue>;
  resetPassword: (memberId: string) => Promise<ResetPasswordResult>;
  resetMfa: (memberId: string) => Promise<FormState | SignedOut | StepUpDue>;
  setStatus: (memberId: string, status: AccountStatus) => Promise<FormState | SignedOut | StepUpDue>;
  remove: (memberId: string) => Promise<FormState | SignedOut | StepUpDue>;
};
