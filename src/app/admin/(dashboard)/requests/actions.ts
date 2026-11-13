"use server";

import { refresh } from "next/cache";
import { failedState, formStateOf, type FormState } from "@/lib/forms/form-state";
import { dashboardAction } from "@/server/admin-actions";
import { bookingService, reservationService } from "@/server/stays";

/*
 * Deciding booking requests. Every action checks the session and the
 * permission itself, and reads each argument as untrusted; the booking
 * service checks the permission again, and that the request is still
 * waiting and the unit still free, in one transaction with closing its
 * nights.
 */

const reloadMessage = "Reload the page and try again.";

/**
 * Accepts a request into a booking in the unit chosen on its card, with the
 * agreed total and deposit, once confirmed. Cancelling it later happens on
 * the booking.
 */
export const acceptRequest = dashboardAction(async (actor, requestId: unknown, terms: unknown): Promise<FormState> => {
  if (typeof requestId !== "string" || typeof terms !== "object" || terms === null) return failedState(reloadMessage);
  const result = await reservationService().acceptRequest(actor, requestId, terms);
  if (result.ok) refresh();
  return formStateOf(result, "Request accepted: it's now a booking, and its nights are closed in that unit.");
}, { permission: "bookings:create" });

/** Declines a request. */
export const declineRequest = dashboardAction(async (actor, requestId: unknown): Promise<FormState> => {
  if (typeof requestId !== "string") return failedState(reloadMessage);
  const result = await bookingService().decisions.decline(actor, requestId, {});
  if (result.ok) refresh();
  return formStateOf(result, "Request declined");
}, { permission: "bookings:cancel" });
