"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { taxReturnPath } from "@/components/admin/tax/tax-paths";
import { failedState, formStateOf, invalidState, savedState, type FormState } from "@/lib/forms/form-state";
import { parseWith } from "@/lib/forms/parse";
import { privateFileMaxBytes } from "@/lib/media/private-files";
import { fileReturnSchema } from "@/lib/tax/tax-input";
import { dashboardAction, dashboardFormAction } from "@/server/admin-actions";
import { privateFileService } from "@/server/media";
import { payrollService, taxService } from "@/server/tax";

/*
 * Tax and payroll from the dashboard. Every action checks the session and
 * its permission itself (tax:manage, payroll:manage: the owner's), reads
 * each argument as untrusted, and the services check again.
 */

// Finance changes ask for the password and code again after 15 minutes (roles.md, "Step-up for sensitive actions").
const tax = { permission: "tax:manage", stepUp: true } as const;
const payroll = { permission: "payroll:manage", stepUp: true } as const;
const reloadMessage = "Reload the page and try again.";

const text = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : null);

export const recordRegistration = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const result = await taxService().recordRegistration(actor, Object.fromEntries(formData));
  if (result.ok) refresh();
  return formStateOf(result, "Registration saved");
}, tax);

export const addParameterVersion = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const result = await taxService().addParameterVersion(actor, Object.fromEntries(formData));
  if (!result.ok) return invalidState(result.errors);
  refresh();
  return savedState(`Version ${result.version} added`);
}, tax);

/** Prepares a return (or refreshes its draft) and opens it. */
export const prepareReturn = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const result = await taxService().prepareReturn(actor, Object.fromEntries(formData));
  if (!result.ok) return invalidState(result.errors);
  redirect(taxReturnPath(result.id));
}, tax);

export const reviewReturn = dashboardAction(async (actor, id: unknown): Promise<FormState> => {
  if (!text(id)) return failedState(reloadMessage);
  const result = await taxService().reviewReturn(actor, id as string);
  if (result.ok) refresh();
  return formStateOf(result, "Marked reviewed");
}, tax);

export const reopenReturn = dashboardAction(async (actor, id: unknown): Promise<FormState> => {
  if (!text(id)) return failedState(reloadMessage);
  const result = await taxService().reopenReturn(actor, id as string);
  if (result.ok) refresh();
  return formStateOf(result, "Back to draft");
}, tax);

export const refreshReturn = dashboardAction(async (actor, id: unknown): Promise<FormState> => {
  if (!text(id)) return failedState(reloadMessage);
  const result = await taxService().refreshReturn(actor, id as string);
  if (result.ok) refresh();
  return formStateOf(result, "Figures refreshed");
}, tax);

export const discardReturn = dashboardAction(async (actor, id: unknown): Promise<FormState> => {
  if (!text(id)) return failedState(reloadMessage);
  return formStateOf(await taxService().discardReturn(actor, id as string), "Draft discarded");
}, tax);

/**
 * Records a reviewed return as filed: the proof of submission is stored as
 * a private file (purpose "proof-of-submission", opened only with
 * tax:manage), then the return is marked filed, which locks its months. The
 * dates are checked before the file is stored.
 */
export const fileReturn = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const id = text(formData.get("returnId"));
  if (!id) return failedState(reloadMessage);
  const fields = { filedOn: formData.get("filedOn"), submissionReference: formData.get("submissionReference") };
  const checked = parseWith(fileReturnSchema, fields);
  if (!checked.ok) return invalidState(checked.errors);
  const existing = await taxService().taxReturn(actor, id);
  if (!existing || existing.status !== "reviewed") return failedState("Mark the return reviewed before recording it as filed.");
  const proof = formData.get("proof");
  if (!(proof instanceof File) || proof.size === 0) return invalidState({ proof: "Choose the proof of submission from eFiling." });
  if (proof.size > privateFileMaxBytes) return invalidState({ proof: "That file is larger than 3.5 MB. Choose a smaller one." });
  const stored = await privateFileService().store(actor, { purpose: "proof-of-submission", fileName: proof.name || "proof-of-submission.pdf", bytes: new Uint8Array(await proof.arrayBuffer()) });
  if (!stored.ok) return invalidState({ proof: Object.values(stored.errors)[0] ?? "That file couldn't be stored." });
  const result = await taxService().fileReturn(actor, id, fields, stored.id);
  if (!result.ok) return invalidState(result.errors);
  refresh();
  const locked = result.locked.length > 0 ? ` ${result.locked.length === 1 ? "Its month is" : "Its months are"} now locked in the books.` : "";
  const notLocked = result.notLocked.length > 0 ? ` Couldn't lock ${result.notLocked.join(", ")}: lock it under Books › Months.` : "";
  return savedState(`Recorded as filed.${locked}${notLocked}`);
}, tax);

export const addEmployee = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const result = await payrollService().addEmployee(actor, Object.fromEntries(formData));
  if (result.ok) refresh();
  return formStateOf(result, "Employee added");
}, payroll);

export const updateEmployee = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const id = text(formData.get("employeeId"));
  if (!id) return failedState(reloadMessage);
  const result = await payrollService().updateEmployee(actor, id, Object.fromEntries(formData));
  if (result.ok) refresh();
  return formStateOf(result, "Details saved");
}, payroll);

export const recordPayrollRun = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const result = await payrollService().recordRun(actor, Object.fromEntries(formData));
  if (!result.ok) return invalidState(result.errors);
  refresh();
  return savedState(result.warnings.length > 0 ? `Pay recorded and posted to the books, with ${result.warnings.length === 1 ? "one thing" : `${result.warnings.length} things`} to check below` : "Pay recorded and posted to the books");
}, payroll);

export const voidPayrollRun = dashboardAction(async (actor, id: unknown, reason: unknown): Promise<FormState> => {
  if (!text(id)) return failedState(reloadMessage);
  const result = await payrollService().voidRun(actor, id as string, { reason: typeof reason === "string" ? reason : "" });
  if (result.ok) refresh();
  return formStateOf(result, "Pay voided");
}, payroll);
