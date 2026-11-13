"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { adminRoutes } from "@/components/admin/admin-routes";
import { failedState, formStateOf, invalidState, type FormState } from "@/lib/forms/form-state";
import { privateFileMaxBytes, sniffPrivateFile } from "@/lib/media/private-files";
import { dashboardAction, dashboardFormAction } from "@/server/admin-actions";
import { bankService, expenseService } from "@/server/bookkeeping";
import { privateFileService } from "@/server/media";

/*
 * Expenses and suppliers from the Books pages. Every action checks the
 * session and expenses:manage itself, reads each argument as untrusted, and
 * the expenses service checks again. A receipt is a private file (purpose
 * "receipt", opened only with expenses:manage); its size and type are
 * checked before anything is stored, so a refused upload leaves nothing
 * behind.
 */

// Finance changes ask for the password and code again after 15 minutes (roles.md, "Step-up for sensitive actions").
const expenses = { permission: "expenses:manage", stepUp: true } as const;
const reloadMessage = "Reload the page and try again.";
const expensesPath = `${adminRoutes.books}/expenses`;

const text = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : null);

/** A receipt's bytes from a form's file field, checked for size and type; null when none was chosen. */
async function receiptFrom(entry: FormDataEntryValue | null): Promise<{ ok: true; file: { name: string; bytes: Uint8Array } | null } | { ok: false; message: string }> {
  if (!(entry instanceof File) || entry.size === 0) return { ok: true, file: null };
  if (entry.size > privateFileMaxBytes) return { ok: false, message: "That receipt is larger than 3.5 MB. Choose a smaller file, or a photo." };
  const bytes = new Uint8Array(await entry.arrayBuffer());
  if (!sniffPrivateFile(bytes)) return { ok: false, message: "Choose a PDF, or a JPEG, PNG or WebP photo of the receipt." };
  return { ok: true, file: { name: entry.name || "receipt", bytes } };
}

/**
 * Records an expense from the expense form, with its receipt if one was
 * chosen, then opens it. From a statement line, the expense's journal is
 * matched to the line and the line opens instead.
 */
export const recordExpense = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const receipt = await receiptFrom(formData.get("receipt"));
  if (!receipt.ok) return invalidState({ receipt: receipt.message });
  const bankLineId = text(formData.get("bankLineId"));
  const fromLine = bankLineId ? await bankService().lineForExpense(actor, bankLineId) : null;
  if (bankLineId && !fromLine) return failedState("That statement line is already matched, or isn't money out. Reload the page.");
  const fields = Object.fromEntries([...formData.entries()].filter(([key]) => key !== "receipt"));
  const result = await expenseService().record(actor, fields);
  if (!result.ok) return invalidState(result.errors);

  const notices: string[] = [];
  if (result.postProblem) notices.push("not-posted");
  if (receipt.file) {
    const stored = await privateFileService().store(actor, { purpose: "receipt", fileName: receipt.file.name, bytes: receipt.file.bytes });
    const attached = stored.ok ? await expenseService().attachReceipt(actor, result.id, stored.id) : stored;
    if (!attached.ok) notices.push("receipt-failed");
  }
  if (fromLine) {
    const matched = result.journalId ? await bankService().matchJournal(actor, fromLine.line.id, result.journalId) : { ok: false as const };
    redirect(`${adminRoutes.books}/bank/${fromLine.account.id}/lines/${fromLine.line.id}?notice=${matched.ok ? "expense-matched" : "expense-not-matched"}`);
  }
  redirect(`${expensesPath}/${result.id}?notice=${notices[0] ?? "recorded"}`);
}, expenses);

export const voidExpense = dashboardAction(async (actor, id: unknown, reason: unknown): Promise<FormState> => {
  if (!text(id)) return failedState(reloadMessage);
  const result = await expenseService().voidExpense(actor, id as string, { reason: typeof reason === "string" ? reason : "" });
  if (!result.ok) return invalidState(result.errors);
  refresh();
  return result.postProblem ? failedState(`Voided, but its reversal couldn't be posted yet: ${result.postProblem}`) : formStateOf(result, "Expense voided. It stays on record, crossed out.");
}, expenses);

/** Tries again to post an expense's journal (or its reversal) that couldn't be posted at the time. */
export const retryExpensePosting = dashboardAction(async (actor, id: unknown): Promise<FormState> => {
  if (!text(id)) return failedState(reloadMessage);
  const result = await expenseService().retryPosting(actor, id as string);
  if (result.ok) refresh();
  return formStateOf(result, "Posted to the books");
}, expenses);

/** A receipt for an expense that has none (images are made smaller in the browser first). */
export const addReceipt = dashboardAction(async (actor, data: unknown): Promise<FormState> => {
  if (!(data instanceof FormData)) return failedState(reloadMessage);
  const id = text(data.get("expenseId"));
  if (!id) return failedState(reloadMessage);
  const receipt = await receiptFrom(data.get("receipt"));
  if (!receipt.ok) return failedState(receipt.message);
  if (!receipt.file) return failedState("Choose the receipt to add.");
  const room = await expenseService().checkReceiptRoom(actor, id);
  if (!room.ok) return invalidState(room.errors);
  const stored = await privateFileService().store(actor, { purpose: "receipt", fileName: receipt.file.name, bytes: receipt.file.bytes });
  if (!stored.ok) return invalidState(stored.errors);
  const result = await expenseService().attachReceipt(actor, id, stored.id);
  if (result.ok) refresh();
  return formStateOf(result, "Receipt added");
}, expenses);

export const addSupplier = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const result = await expenseService().addSupplier(actor, Object.fromEntries(formData));
  if (result.ok) refresh();
  return formStateOf(result, "Supplier added");
}, expenses);

export const changeSupplier = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const id = text(formData.get("supplierId"));
  if (!id) return failedState(reloadMessage);
  const result = await expenseService().changeSupplier(actor, id, Object.fromEntries(formData));
  if (result.ok) refresh();
  return formStateOf(result, "Supplier saved");
}, expenses);
