"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { failedState, formStateOf, invalidState, type FormState } from "@/lib/forms/form-state";
import { dashboardAction, dashboardFormAction } from "@/server/admin-actions";
import { allUnits, reservationService } from "@/server/stays";

/*
 * Bookings from the dashboard. Every action checks the session and its
 * permission itself, reads each argument as untrusted, and the reservations
 * service checks the permission again. Changes to a booking's nights happen
 * in one transaction with its unit's block, guarded by the database.
 */

const reloadMessage = "Reload the page and try again.";

/** A new booking from the new-booking form; opens it once it's made. */
export const createBooking = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const result = await reservationService().create(actor, Object.fromEntries(formData));
  if (!result.ok) return invalidState(result.errors);
  redirect(`/admin/bookings/${result.id}?notice=created`);
}, { permission: "bookings:create" });

/** Changes a booking from its edit form (the booking's id rides along as a hidden field). */
export const changeBooking = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const id = formData.get("bookingId");
  if (typeof id !== "string") return failedState(reloadMessage);
  const result = await reservationService().change(actor, id, Object.fromEntries(formData));
  if (result.ok) refresh();
  return formStateOf(result, "Booking saved");
}, { permission: "bookings:change" });

export const cancelBooking = dashboardAction(async (actor, id: unknown, reason: unknown): Promise<FormState> => {
  if (typeof id !== "string") return failedState(reloadMessage);
  const result = await reservationService().cancel(actor, id, { reason: typeof reason === "string" ? reason : "" });
  if (result.ok) refresh();
  return formStateOf(result, "Booking cancelled. Its nights are open again.");
}, { permission: "bookings:cancel" });

export const checkInBooking = dashboardAction(async (actor, id: unknown): Promise<FormState> => {
  if (typeof id !== "string") return failedState(reloadMessage);
  const result = await reservationService().checkIn(actor, id);
  if (result.ok) refresh();
  return formStateOf(result, "Checked in");
}, { permission: "stays:check-in-out" });

export const checkOutBooking = dashboardAction(async (actor, id: unknown): Promise<FormState> => {
  if (typeof id !== "string") return failedState(reloadMessage);
  const result = await reservationService().checkOut(actor, id);
  if (result.ok) refresh();
  return formStateOf(result, "Checked out");
}, { permission: "stays:check-in-out" });

export const markNoShow = dashboardAction(async (actor, id: unknown): Promise<FormState> => {
  if (typeof id !== "string") return failedState(reloadMessage);
  const result = await reservationService().noShow(actor, id);
  if (result.ok) refresh();
  return formStateOf(result, "Marked as a no-show. Its nights are open again.");
}, { permission: "stays:check-in-out" });

/** The rates' total for a stay, for the new-booking form: whole cents, or null when there's no rate. */
export const quoteBooking = dashboardAction(async (actor, unitId: unknown, arrive: unknown, leave: unknown, guests: unknown) => {
  if (typeof unitId !== "string" || typeof arrive !== "string" || typeof leave !== "string" || typeof guests !== "number") return { status: "quote" as const, cents: null };
  const unit = (await allUnits()).find((candidate) => candidate.id === unitId);
  if (!unit || !(leave > arrive)) return { status: "quote" as const, cents: null };
  return { status: "quote" as const, cents: await reservationService().suggestedTotal(actor, unit.apartment, { arrive, leave }, guests) };
}, { permission: "bookings:create" });
