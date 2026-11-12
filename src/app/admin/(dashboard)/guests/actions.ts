"use server";

import { refresh } from "next/cache";
import { failedState, formStateOf, type FormState } from "@/lib/forms/form-state";
import { dashboardFormAction } from "@/server/admin-actions";
import { reservationService } from "@/server/stays";

/** Changes a guest's details from their page (the guest's id rides along as a hidden field). The service checks guests:manage again. */
export const changeGuest = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const id = formData.get("guestId");
  if (typeof id !== "string") return failedState("Reload the page and try again.");
  const result = await reservationService().updateGuest(actor, id, Object.fromEntries(formData));
  if (result.ok) refresh();
  return formStateOf(result, "Guest saved");
}, { permission: "guests:manage" });
