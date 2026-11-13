"use server";

import { refresh } from "next/cache";
import { accountStatusInput, addMemberInput, changeRoleInput, memberIdInput } from "@/lib/accounts/input";
import { failedState, formStateOf, invalidState, type FormState } from "@/lib/forms/form-state";
import { parseWith } from "@/lib/forms/parse";
import type { FieldErrors } from "@/lib/kernel/result";
import { accountServices } from "@/server/accounts";
import { dashboardAction } from "@/server/admin-actions";

/*
 * Managing the team. Every action checks the session, the permission and a
 * recent password-and-code confirmation itself, and reads each argument as
 * untrusted, since anyone can call a server action with anything. The team
 * service checks again which roles the actor may manage (admins: staff
 * only). Temporary passwords go back to the browser once, in the answer,
 * and are never kept or logged.
 */

const manageStaff = { permission: "team:manage-operational", stepUp: true } as const;
const manageEveryone = { permission: "team:manage-all", stepUp: true } as const;

/** A refusal as the add form shows it: beside the field it's about (the address is taken), or above the form. */
function refusalOf(errors: FieldErrors): { status: "invalid"; errors: FieldErrors } | { status: "failed"; message: string } {
  const state = invalidState(errors);
  return state.status === "failed" ? state : { status: "invalid", errors };
}

/** Adds someone from the add form's fields; answers with their temporary password. */
export const addTeamMember = dashboardAction(async (actor, data: unknown) => {
  if (!(data instanceof FormData)) return { status: "failed" as const, message: "Reload the page and try again." };
  const input = parseWith(addMemberInput, Object.fromEntries(data));
  if (!input.ok) return { status: "invalid" as const, errors: input.errors };
  const added = await accountServices().team.addMember(actor, input.value);
  if (!added.ok) return refusalOf(added.errors);
  refresh();
  return { status: "added" as const, name: input.value.name, temporaryPassword: added.temporaryPassword };
}, manageStaff);

/** Changes someone's role (owners only). */
export const changeTeamMemberRole = dashboardAction(async (actor, memberId: unknown, role: unknown): Promise<FormState> => {
  const id = parseWith(memberIdInput, memberId);
  if (!id.ok) return failedState(Object.values(id.errors)[0] ?? "");
  const input = parseWith(changeRoleInput, { role });
  if (!input.ok) return invalidState(input.errors);
  const result = await accountServices().team.changeRole(actor, id.value, input.value);
  if (result.ok) refresh();
  return formStateOf(result, "Role changed");
}, manageEveryone);

/** Gives someone a new temporary password, signing them out everywhere; answers with it. */
export const resetTeamMemberPassword = dashboardAction(async (actor, memberId: unknown) => {
  const id = parseWith(memberIdInput, memberId);
  if (!id.ok) return { status: "failed" as const, message: Object.values(id.errors)[0] ?? "" };
  const result = await accountServices().team.resetPassword(actor, id.value);
  if (!result.ok) return { status: "failed" as const, message: Object.values(result.errors)[0] ?? "" };
  refresh();
  return { status: "reset" as const, temporaryPassword: result.temporaryPassword };
}, manageStaff);

/** Removes someone's authenticator, for a lost phone (owners only). */
export const resetTeamMemberMfa = dashboardAction(async (actor, memberId: unknown): Promise<FormState> => {
  const id = parseWith(memberIdInput, memberId);
  if (!id.ok) return failedState(Object.values(id.errors)[0] ?? "");
  const result = await accountServices().team.resetMfa(actor, id.value);
  if (result.ok) refresh();
  return formStateOf(result, "Authenticator reset");
}, manageEveryone);

/** Turns someone's access off or back on. */
export const setTeamMemberStatus = dashboardAction(async (actor, memberId: unknown, status: unknown): Promise<FormState> => {
  const id = parseWith(memberIdInput, memberId);
  if (!id.ok) return failedState(Object.values(id.errors)[0] ?? "");
  const wanted = accountStatusInput.safeParse(status);
  if (!wanted.success) return failedState("Reload the page and try again.");
  const result = await accountServices().team.setStatus(actor, id.value, wanted.data);
  if (result.ok) refresh();
  return formStateOf(result, wanted.data === "active" ? "Access turned on" : "Access turned off");
}, manageStaff);

/** Removes someone's account (owners only), never the last owner's. */
export const removeTeamMember = dashboardAction(async (actor, memberId: unknown): Promise<FormState> => {
  const id = parseWith(memberIdInput, memberId);
  if (!id.ok) return failedState(Object.values(id.errors)[0] ?? "");
  const result = await accountServices().team.removeMember(actor, id.value);
  if (result.ok) refresh();
  return formStateOf(result, "Removed");
}, manageEveryone);
