"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { adminRoutes } from "@/components/admin/admin-routes";
import { decodeStatement, statementLimits } from "@/lib/bookkeeping/statement";
import { failedState, formStateOf, invalidState, type FormState } from "@/lib/forms/form-state";
import { dashboardAction, dashboardFormAction } from "@/server/admin-actions";
import { bankService } from "@/server/bookkeeping";

/*
 * Bank accounts, statement imports and reconciliation from the Books pages.
 * Every action checks the session and bank:manage itself, reads each
 * argument as untrusted, and the bank service checks again. A statement's
 * size is checked before it's read; nothing is sent to any bank.
 */

// Finance changes ask for the password and code again after 15 minutes (roles.md, "Step-up for sensitive actions").
const bank = { permission: "bank:manage", stepUp: true } as const;
const reloadMessage = "Reload the page and try again.";
const bankPath = `${adminRoutes.books}/bank`;

const text = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : null);

/** Adds a bank account from the sheet, then opens it. */
export const addBankAccount = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const result = await bankService().addAccount(actor, Object.fromEntries(formData));
  if (!result.ok) return invalidState(result.errors);
  redirect(`${bankPath}/${result.id}?notice=added`);
}, bank);

/** Imports a statement (a CSV file) with the columns the form gives, then shows the account with what came of it. */
export const importStatement = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const accountId = text(formData.get("accountId"));
  if (!accountId) return failedState(reloadMessage);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return invalidState({ file: "Choose the statement file you exported from your bank." });
  if (file.size > statementLimits.maxBytes) return invalidState({ file: "That file is larger than 1 MB. Export a shorter period from your bank." });
  const statementText = decodeStatement(new Uint8Array(await file.arrayBuffer()));
  const mapping = Object.fromEntries([...formData.entries()].filter(([key]) => key !== "file"));
  const result = await bankService().importStatement(actor, accountId, { fileName: file.name, text: statementText, mapping });
  if (!result.ok) return invalidState(result.errors);
  const counts = new URLSearchParams({ imported: String(result.added), duplicates: String(result.duplicates), skipped: String(result.skipped) });
  redirect(`${bankPath}/${accountId}?${counts}`);
}, bank);

/** Matches a statement line to a journal already in the books. */
export const matchLine = dashboardAction(async (actor, lineId: unknown, journalId: unknown): Promise<FormState> => {
  if (!text(lineId) || !text(journalId)) return failedState(reloadMessage);
  const result = await bankService().matchJournal(actor, lineId as string, journalId as string);
  if (result.ok) refresh();
  return formStateOf(result, "Matched");
}, bank);

/** Makes a journal from a statement line (bank charges, a channel's payout…) and matches it. */
export const makeLineJournal = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const lineId = text(formData.get("lineId"));
  if (!lineId) return failedState(reloadMessage);
  const result = await bankService().makeJournal(actor, lineId, Object.fromEntries(formData));
  if (result.ok) refresh();
  return formStateOf(result, "Recorded in the books and matched");
}, bank);

/** Unmatches a line; a journal made from it is reversed. */
export const unmatchLine = dashboardAction(async (actor, lineId: unknown): Promise<FormState> => {
  if (!text(lineId)) return failedState(reloadMessage);
  const result = await bankService().unmatch(actor, lineId as string);
  if (result.ok) refresh();
  return formStateOf(result, "Unmatched. The line is back with those not matched yet.");
}, bank);
