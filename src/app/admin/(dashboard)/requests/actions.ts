"use server";

import { refresh } from "next/cache";
import { failedState, formStateOf, type FormState } from "@/lib/forms/form-state";
import { dashboardAction } from "@/server/admin-actions";
import { bookingService } from "@/server/stays";

/*
 * Deciding booking requests. Every action checks the session and the
 * permission itself, and reads each argument as untrusted; the booking
 * service checks the permission again, and that the request is still
 * waiting and the unit still free, in one transaction with closing its
 * nights.
 */

const reloadMessage = "Reload the page and try again.";

/** Accepts a request into the unit chosen on its card, once confirmed. */
export const acceptRequest = dashboardAction(async (actor, requestId: unknown, unitId: unknown): Promise<FormState> => {
  if (typeof requestId !== "string") return failedState(reloadMessage);
  const result = await bookingService().decisions.accept(actor, requestId, { unitId });
  if (result.ok) refresh();
  return formStateOf(result, "Request accepted. Its nights are now closed in that unit.");
}, { permission: "bookings:create" });

/** Cancels an accepted request, opening its nights again. */
export const cancelAcceptedRequest = dashboardAction(async (actor, requestId: unknown): Promise<FormState> => {
  if (typeof requestId !== "string") return failedState(reloadMessage);
  const result = await bookingService().decisions.cancel(actor, requestId);
  if (result.ok) refresh();
  return formStateOf(result, "Booking cancelled. Its nights are open again.");
}, { permission: "bookings:cancel" });

/** Declines a request. */
export const declineRequest = dashboardAction(async (actor, requestId: unknown): Promise<FormState> => {
  if (typeof requestId !== "string") return failedState(reloadMessage);
  const result = await bookingService().decisions.decline(actor, requestId, {});
  if (result.ok) refresh();
  return formStateOf(result, "Request declined");
}, { permission: "bookings:cancel" });
