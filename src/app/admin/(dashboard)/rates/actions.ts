"use server";

import { refresh } from "next/cache";
import { failedState, formStateOf, type FormState } from "@/lib/forms/form-state";
import { dashboardAction, dashboardFormAction } from "@/server/admin-actions";
import { rateService } from "@/server/rates";

/*
 * Rates from the dashboard. Every action checks the session and rates:manage
 * itself (the owner and sales), reads each argument as untrusted, and the
 * rate service checks the permission again. The database keeps seasons from
 * overlapping, whatever the forms sent.
 */

const manageRates = { permission: "rates:manage" } as const;
const reloadMessage = "Reload the page and try again.";

/** An apartment's plan, from its panel's form (the apartment's slug rides along as a hidden field). */
export const saveRatePlan = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const apartment = formData.get("apartment");
  if (typeof apartment !== "string") return failedState(reloadMessage);
  const result = await rateService().savePlan(actor, apartment, Object.fromEntries(formData));
  if (result.ok) refresh();
  return formStateOf(result, "Rate saved");
}, manageRates);

export const removeRatePlan = dashboardAction(async (actor, apartment: unknown): Promise<FormState> => {
  if (typeof apartment !== "string") return failedState(reloadMessage);
  const result = await rateService().removePlan(actor, apartment);
  if (result.ok) refresh();
  return formStateOf(result, "Rate removed. The website says Price on request for it again.");
}, manageRates);

export const addSeason = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const result = await rateService().addSeason(actor, Object.fromEntries(formData));
  if (result.ok) refresh();
  return formStateOf(result, "Season added");
}, manageRates);

/** A season's changes, from its edit form (the season's id rides along as a hidden field). */
export const changeSeason = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const id = formData.get("seasonId");
  if (typeof id !== "string") return failedState(reloadMessage);
  const result = await rateService().changeSeason(actor, id, Object.fromEntries(formData));
  if (result.ok) refresh();
  return formStateOf(result, "Season saved");
}, manageRates);

export const removeSeason = dashboardAction(async (actor, id: unknown): Promise<FormState> => {
  if (typeof id !== "string") return failedState(reloadMessage);
  const result = await rateService().removeSeason(actor, id);
  if (result.ok) refresh();
  return formStateOf(result, "Season removed");
}, manageRates);
