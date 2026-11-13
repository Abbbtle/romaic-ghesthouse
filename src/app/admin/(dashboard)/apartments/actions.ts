"use server";

import { refresh } from "next/cache";
import { failedState, formStateOf, type FormState } from "@/lib/forms/form-state";
import { dashboardAction, dashboardFormAction } from "@/server/admin-actions";
import { inventoryService } from "@/server/stays";

/*
 * Units and closed nights. Every action checks the session and rates:manage
 * itself (owner and sales); the inventory service checks again, and the
 * database refuses two closures sharing a night on one unit.
 */

const manageInventory = { permission: "rates:manage" } as const;
const reloadMessage = "Reload the page and try again.";

export const addUnit = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const result = await inventoryService().addUnit(actor, Object.fromEntries(formData));
  if (result.ok) refresh();
  return formStateOf(result, "Unit added");
}, manageInventory);

export const setUnitOffered = dashboardAction(async (actor, unitId: unknown, offered: unknown): Promise<FormState> => {
  if (typeof unitId !== "string" || typeof offered !== "boolean") return failedState(reloadMessage);
  const result = await inventoryService().setUnitOffered(actor, unitId, offered);
  if (result.ok) refresh();
  return formStateOf(result, offered ? "Unit offered again" : "Unit no longer offered");
}, manageInventory);

export const closeNights = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const result = await inventoryService().addBlock(actor, Object.fromEntries(formData));
  if (result.ok) refresh();
  return formStateOf(result, "Nights closed");
}, manageInventory);

export const openNights = dashboardAction(async (actor, blockId: unknown): Promise<FormState> => {
  if (typeof blockId !== "string") return failedState(reloadMessage);
  const result = await inventoryService().removeBlock(actor, blockId);
  if (result.ok) refresh();
  return formStateOf(result, "Nights opened");
}, manageInventory);
