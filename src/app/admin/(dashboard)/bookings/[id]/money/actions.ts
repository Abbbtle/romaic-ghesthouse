"use server";

import { refresh } from "next/cache";
import { failedState, formStateOf, invalidState, savedState, type FormState } from "@/lib/forms/form-state";
import { dashboardAction, dashboardFormAction } from "@/server/admin-actions";
import { moneyService, simulateTestPayment } from "@/server/money";

/*
 * A booking's money from its money page. Every action checks the session
 * and booking-money:manage itself, reads each argument as untrusted, and the
 * money service checks again (refunds, and voiding them, are the owner's:
 * refunds:issue). The booking's id rides along as a hidden field or an
 * argument; the service checks each payment and invoice belongs to it.
 */

const money = { permission: "booking-money:manage" } as const;
const reloadMessage = "Reload the page and try again.";

const text = (value: unknown) => (typeof value === "string" ? value : null);

export const recordPayment = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const bookingId = text(formData.get("bookingId"));
  if (!bookingId) return failedState(reloadMessage);
  const result = await moneyService().recordPayment(actor, bookingId, Object.fromEntries(formData));
  if (!result.ok) return invalidState(result.errors);
  refresh();
  return savedState(result.receiptNumber ? `Payment recorded: receipt ${result.receiptNumber}` : "Payment recorded");
}, money);

export const voidPayment = dashboardAction(async (actor, bookingId: unknown, paymentId: unknown, reason: unknown): Promise<FormState> => {
  if (!text(bookingId) || !text(paymentId)) return failedState(reloadMessage);
  const result = await moneyService().voidPayment(actor, bookingId as string, paymentId as string, { reason: text(reason) ?? "" });
  if (result.ok) refresh();
  return formStateOf(result, "Payment voided. It stays on record, crossed out.");
}, money);

export const issueInvoice = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const bookingId = text(formData.get("bookingId"));
  if (!bookingId) return failedState(reloadMessage);
  const result = await moneyService().issueInvoice(actor, bookingId, Object.fromEntries(formData));
  if (!result.ok) return invalidState(result.errors);
  refresh();
  return savedState(`Invoice ${result.number} issued`);
}, money);

export const voidInvoice = dashboardAction(async (actor, bookingId: unknown, invoiceId: unknown, reason: unknown): Promise<FormState> => {
  if (!text(bookingId) || !text(invoiceId)) return failedState(reloadMessage);
  const result = await moneyService().voidInvoice(actor, bookingId as string, invoiceId as string, { reason: text(reason) ?? "" });
  if (result.ok) refresh();
  return formStateOf(result, "Invoice voided. It stays on record, marked void.");
}, money);

/** Test mode: a payment link that waits in the payments list until a payment is acted out for it. */
export const createTestPaymentLink = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const bookingId = text(formData.get("bookingId"));
  if (!bookingId) return failedState(reloadMessage);
  const result = await moneyService().createCheckout(actor, bookingId, Object.fromEntries(formData));
  if (!result.ok) return invalidState(result.errors);
  refresh();
  return savedState("Test payment link made. It's waiting under Payments.");
}, money);

/** Test mode: the gateway reporting a waiting payment as paid or failed. */
export const actOutTestPayment = dashboardAction(async (actor, bookingId: unknown, paymentId: unknown, outcome: unknown): Promise<FormState> => {
  if (!text(bookingId) || !text(paymentId) || (outcome !== "paid" && outcome !== "failed")) return failedState(reloadMessage);
  const result = await simulateTestPayment(actor, bookingId as string, paymentId as string, outcome);
  if (!result.ok) return invalidState(result.errors);
  refresh();
  if (result.result === "settled") return savedState("Test payment received, with its receipt");
  if (result.result === "failed") return savedState("Test payment marked as failed");
  return failedState(reloadMessage);
}, money);
