"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { adminRoutes } from "@/components/admin/admin-routes";
import { isPeriod } from "@/components/admin/books/book-months";
import { compactJournalFields, errorsOnRows } from "@/components/admin/books/journal-form";
import { failedState, formStateOf, invalidState, type FormState } from "@/lib/forms/form-state";
import { dashboardAction, dashboardFormAction } from "@/server/admin-actions";
import { ledgerService } from "@/server/ledger";

/*
 * The books from the dashboard. Every action checks the session and its
 * permission itself, reads each argument as untrusted, and the ledger
 * service checks the permission again. All of it is the owner's alone:
 * - ledger:post: manual journals, reversals, the chart and the settings;
 * - periods:lock: locking and reopening months.
 */

// Finance changes ask for the password and code again after 15 minutes (roles.md, "Step-up for sensitive actions").
const post = { permission: "ledger:post", stepUp: true } as const;
const lock = { permission: "periods:lock", stepUp: true } as const;
const reloadMessage = "Reload the page and try again.";
const journalCode = /^\d{4}$/;

/** A manual journal from the new-journal form; opens it once it's posted. Empty rows are left out, and problems go back to the row they came from. */
export const postJournal = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const { fields, rowOf } = compactJournalFields(Object.fromEntries(formData));
  const result = await ledgerService().postManual(actor, fields);
  if (!result.ok) return invalidState(errorsOnRows(result.errors, rowOf));
  redirect(`${adminRoutes.books}/journals/${result.id}?notice=posted`);
}, post);

/** Undoes a journal with its reversal, dated today, with the reason on record. */
export const reverseJournal = dashboardAction(async (actor, id: unknown, reason: unknown): Promise<FormState> => {
  if (typeof id !== "string") return failedState(reloadMessage);
  const result = await ledgerService().reverseJournal(actor, id, { reason: typeof reason === "string" ? reason : "" });
  if (result.ok) refresh();
  return formStateOf(result, "Journal reversed");
}, post);

/** A new account from the add-account sheet. */
export const addAccount = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const result = await ledgerService().addAccount(actor, { code: formData.get("code"), name: formData.get("name") });
  if (result.ok) refresh();
  return formStateOf(result, "Account added");
}, post);

/** An account's switch, saved as it's flipped. Accounts automatic postings use stay on. */
export const setAccountActive = dashboardAction(async (actor, code: unknown, active: unknown): Promise<FormState> => {
  if (typeof code !== "string" || !journalCode.test(code) || typeof active !== "boolean") return failedState(reloadMessage);
  const result = await ledgerService().setAccountActive(actor, code, active);
  if (result.ok) refresh();
  return formStateOf(result, active ? "Account switched on" : "Account switched off");
}, post);

/** Locks a month: nothing more can be posted in it until it's reopened. */
export const lockMonth = dashboardAction(async (actor, period: unknown): Promise<FormState> => {
  if (!isPeriod(period)) return failedState(reloadMessage);
  const result = await ledgerService().lockPeriod(actor, period);
  if (result.ok) refresh();
  return formStateOf(result, "Month locked");
}, lock);

/** Reopens a locked month, with the reason on record. */
export const reopenMonth = dashboardAction(async (actor, period: unknown, reason: unknown): Promise<FormState> => {
  if (!isPeriod(period)) return failedState(reloadMessage);
  const result = await ledgerService().unlockPeriod(actor, period, { reason: typeof reason === "string" ? reason : "" });
  if (result.ok) refresh();
  return formStateOf(result, "Month reopened");
}, lock);

/** The books' settings: the month the financial year ends, and the main bank account. */
export const saveBooksSettings = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const result = await ledgerService().saveSettings(actor, { yearEndMonth: formData.get("yearEndMonth"), mainBank: formData.get("mainBank") });
  if (result.ok) refresh();
  return formStateOf(result, "Settings saved");
}, post);
