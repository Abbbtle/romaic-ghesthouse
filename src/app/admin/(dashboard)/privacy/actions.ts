"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { privacyRequestPath } from "@/components/admin/privacy/privacy-paths";
import { failedState, formStateOf, invalidState, savedState, type FormState } from "@/lib/forms/form-state";
import { dashboardAction, dashboardFormAction } from "@/server/admin-actions";
import { privacyService } from "@/server/privacy";

/*
 * Privacy from the dashboard. Every action checks the session and its
 * permission itself (privacy:requests: the owner's), reads each argument as
 * untrusted, and the service checks again. Opening a requester's contact,
 * anonymising a guest and changing a retention rule ask for the password
 * and code again after 15 minutes (roles.md, step-up), like exports.
 */

const privacy = { permission: "privacy:requests" } as const;
const sensitive = { permission: "privacy:requests", stepUp: true } as const;
const reloadMessage = "Reload the page and try again.";

const text = (value: unknown): string | null => (typeof value === "string" && value.length > 0 && value.length <= 64 ? value : null);

export const saveOfficer = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const result = await privacyService().saveOfficer(actor, Object.fromEntries(formData));
  if (result.ok) refresh();
  return formStateOf(result, "Information Officer saved");
}, privacy);

/** Logs a request and opens it. */
export const logRequest = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const result = await privacyService().logRequest(actor, Object.fromEntries(formData));
  if (!result.ok) return invalidState(result.errors);
  redirect(privacyRequestPath(result.id));
}, privacy);

export const changeRequest = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const id = text(formData.get("requestId"));
  if (!id) return failedState(reloadMessage);
  const result = await privacyService().changeRequest(actor, id, Object.fromEntries(formData));
  if (result.ok) refresh();
  return formStateOf(result, "Request saved");
}, privacy);

export const startRequest = dashboardAction(async (actor, id: unknown, revision: unknown): Promise<FormState> => {
  const requestId = text(id);
  if (!requestId) return failedState(reloadMessage);
  const result = await privacyService().startRequest(actor, requestId, { revision });
  if (result.ok) refresh();
  return formStateOf(result, "Marked in progress");
}, privacy);

export const answerRequest = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const id = text(formData.get("requestId"));
  if (!id) return failedState(reloadMessage);
  const result = await privacyService().answerRequest(actor, id, Object.fromEntries(formData));
  if (result.ok) refresh();
  return formStateOf(result, "Marked answered");
}, privacy);

export const refuseRequest = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const id = text(formData.get("requestId"));
  if (!id) return failedState(reloadMessage);
  const result = await privacyService().refuseRequest(actor, id, Object.fromEntries(formData));
  if (result.ok) refresh();
  return formStateOf(result, "Marked refused");
}, privacy);

export const confirmIdentity = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const id = text(formData.get("requestId"));
  if (!id) return failedState(reloadMessage);
  const result = await privacyService().confirmIdentity(actor, id, Object.fromEntries(formData));
  if (result.ok) refresh();
  return formStateOf(result, "Noted who they are");
}, privacy);

export const linkGuest = dashboardAction(async (actor, requestId: unknown, guestId: unknown): Promise<FormState> => {
  const request = text(requestId);
  const guest = text(guestId);
  if (!request || !guest) return failedState(reloadMessage);
  const result = await privacyService().linkGuest(actor, request, guest);
  if (result.ok) refresh();
  return formStateOf(result, "Guest linked to the request");
}, privacy);

export const unlinkGuest = dashboardAction(async (actor, requestId: unknown): Promise<FormState> => {
  const request = text(requestId);
  if (!request) return failedState(reloadMessage);
  const result = await privacyService().unlinkGuest(actor, request);
  if (result.ok) refresh();
  return formStateOf(result, "Guest unlinked");
}, privacy);

/** A requester's contact, opened to answer them: the form state carries it as its message, shown only where it was asked for. */
export const revealContact = dashboardAction(async (actor, requestId: unknown): Promise<FormState> => {
  const request = text(requestId);
  if (!request) return failedState(reloadMessage);
  const result = await privacyService().revealContact(actor, request);
  return result.ok ? savedState(result.contact) : invalidState(result.errors);
}, sensitive);

export const anonymiseGuest = dashboardAction(async (actor, guestId: unknown, confirmName: unknown, requestId: unknown): Promise<FormState> => {
  const guest = text(guestId);
  if (!guest || typeof confirmName !== "string") return failedState(reloadMessage);
  const result = await privacyService().anonymiseGuest(actor, guest, { confirmName, requestId: text(requestId) });
  if (result.ok) refresh();
  return formStateOf(result, "Guest record anonymised");
}, sensitive);

export const recordBreach = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const result = await privacyService().recordBreach(actor, Object.fromEntries(formData));
  if (result.ok) refresh();
  return formStateOf(result, "Breach recorded");
}, privacy);

export const changeBreach = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const id = text(formData.get("breachId"));
  if (!id) return failedState(reloadMessage);
  const result = await privacyService().changeBreach(actor, id, Object.fromEntries(formData));
  if (result.ok) refresh();
  return formStateOf(result, "Breach saved");
}, privacy);

export const setRetentionPeriod = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const kind = text(formData.get("kind"));
  if (!kind) return failedState(reloadMessage);
  const result = await privacyService().setPolicy(actor, kind, Object.fromEntries(formData));
  if (result.ok) refresh();
  return formStateOf(result, "Rule saved and confirmed");
}, sensitive);

export const confirmRetentionRule = dashboardAction(async (actor, kind: unknown): Promise<FormState> => {
  const rule = text(kind);
  if (!rule) return failedState(reloadMessage);
  const result = await privacyService().confirmPolicy(actor, rule);
  if (result.ok) refresh();
  return formStateOf(result, "Rule confirmed");
}, sensitive);
