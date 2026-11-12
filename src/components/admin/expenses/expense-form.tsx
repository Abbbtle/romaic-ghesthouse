"use client";

import { useRef, useState } from "react";
import { DateField, Select, TextField } from "@/components/ui/fields";
import { Notice } from "@/components/ui/notice";
import { expenseSchema } from "@/lib/bookkeeping/bookkeeping-input";
import { expenseLimits, paymentSourceNames, paymentSources, type PaymentSource } from "@/lib/bookkeeping/expenses";
import type { FormAction } from "@/lib/forms/form-state";
import { parseWith } from "@/lib/forms/parse";
import type { FieldErrors } from "@/lib/kernel/result";
import { ActionForm } from "../action-form";
import { FileField } from "./file-field";
import { acceptedReceiptTypes, prepareReceipt, replaceChosenFile } from "./prepare-receipt";

export type ExpenseFormOptions = {
  today: string;
  accounts: { code: string; name: string; kind: string }[];
  suppliers: { id: string; name: string }[];
  bankAccounts: { id: string; label: string }[];
  channels: { code: string; name: string }[];
};

/** What a statement line fills in when an expense is recorded from it. */
export type ExpensePrefill = { date: string; amount: string; description: string; bankAccountId: string; bankLineId: string; lineLabel: string };

/** The expense's rules as fields are left (the server checks them all again); the receipt is checked as it's chosen. */
function validate(data: FormData): FieldErrors {
  const parsed = parseWith(expenseSchema, Object.fromEntries([...data.entries()].filter(([key]) => key !== "receipt")));
  return parsed.ok ? {} : parsed.errors;
}

const accountLabel = (account: ExpenseFormOptions["accounts"][number]) => (account.kind === "asset" ? `${account.name} (bought to keep)` : account.name);

/**
 * Records an expense (Pattern: form): when, who to, what for, how much, how
 * it was paid, and a photo or PDF of the receipt if there is one. A photo is
 * made smaller on the phone before it's sent. From a statement line, the
 * day, amount, description and bank account come filled in.
 */
export function ExpenseForm({ action, options, receiptMaxBytes, prefill }: { action: FormAction; options: ExpenseFormOptions; receiptMaxBytes: number; prefill?: ExpensePrefill }) {
  const [supplier, setSupplier] = useState(options.suppliers.length > 0 ? "" : "new");
  const [paidBy, setPaidBy] = useState<PaymentSource>("bank");
  const [preparing, setPreparing] = useState<string | null>(null);
  const [receiptProblem, setReceiptProblem] = useState<string | null>(null);
  const receipt = useRef<HTMLInputElement>(null);

  async function chooseReceipt(file: File | null, input: HTMLInputElement) {
    setReceiptProblem(null);
    if (!file) return;
    setPreparing("Getting the receipt ready…");
    const prepared = await prepareReceipt(file, receiptMaxBytes);
    setPreparing(null);
    if (!prepared.ok) {
      input.value = "";
      setReceiptProblem(prepared.problem);
      return;
    }
    if (prepared.file !== file && !replaceChosenFile(input, prepared.file) && file.size > receiptMaxBytes) {
      input.value = "";
      setReceiptProblem("That photo is too big to send from this browser. Add it from the expense's page once it's recorded.");
    }
  }

  return (
    <ActionForm action={action} validate={validate} footer="button" submitLabel="Record expense" pendingLabel="Recording…" subject="this expense" className="grid max-w-2xl gap-5">
      {prefill && (
        <Notice tone="info" title="From your bank statement">
          {prefill.lineLabel}. Once it&rsquo;s recorded, the line is matched to it.
        </Notice>
      )}
      {prefill && <input type="hidden" name="bankLineId" value={prefill.bankLineId} />}
      <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
        <DateField name="date" label="Paid on" defaultValue={prefill?.date ?? options.today} />
        <TextField name="amount" label="Amount (R)" inputMode="decimal" autoComplete="off" placeholder="e.g. 1250 or 1250.50" maxLength={16} defaultValue={prefill?.amount} />
      </div>

      {options.suppliers.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
          <Select
            name="supplierId"
            label="Paid to"
            placeholder="Choose who it was paid to"
            options={[...options.suppliers.map((entry) => ({ value: entry.id, label: entry.name })), { value: "new", label: "Someone new…" }]}
            onValueChange={setSupplier}
          />
          {supplier === "new" && <TextField name="supplierName" label="Their name" maxLength={expenseLimits.supplierNameMax} hint="They're added to your suppliers." />}
        </div>
      ) : (
        <>
          <input type="hidden" name="supplierId" value="new" />
          <TextField name="supplierName" label="Paid to" maxLength={expenseLimits.supplierNameMax} hint="The shop, business or person. They're added to your suppliers." />
        </>
      )}

      <Select name="accountCode" label="What it was for" placeholder="Choose what it was for" options={options.accounts.map((account) => ({ value: account.code, label: accountLabel(account) }))} />
      <TextField name="description" label="What it was" maxLength={expenseLimits.descriptionMax} defaultValue={prefill?.description} hint="A few words, like Tap washers and a shower head." />

      <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
        <Select
          name="paidBy"
          label="How it was paid"
          defaultValue={paidBy}
          options={paymentSources.map((source) => ({ value: source, label: paymentSourceNames[source] }))}
          onValueChange={(value) => setPaidBy(value as PaymentSource)}
        />
        {paidBy === "bank" && options.bankAccounts.length > 0 && (
          <Select
            name="bankAccountId"
            label="Which bank account"
            placeholder="Choose the account"
            defaultValue={prefill?.bankAccountId ?? (options.bankAccounts.length === 1 ? options.bankAccounts[0]!.id : undefined)}
            options={options.bankAccounts.map((account) => ({ value: account.id, label: account.label }))}
          />
        )}
        {paidBy === "channel" && (
          <Select
            name="channelAccount"
            label="Which channel"
            placeholder="Choose the channel"
            options={options.channels.map((channel) => ({ value: channel.code, label: channel.name }))}
            hint="For commission a channel kept back from what it paid you."
          />
        )}
      </div>
      {paidBy === "bank" && options.bankAccounts.length === 0 && (
        <p className="-mt-2 text-sm text-fg-2">It&rsquo;s taken from Bank in the books. Add your bank accounts on the Bank tab to choose between them.</p>
      )}
      {paidBy === "owner" && <p className="-mt-2 text-sm text-fg-2">Counted as money the owner put into the business.</p>}

      <FileField
        name="receipt"
        label="Receipt"
        optional
        accept={acceptedReceiptTypes}
        inputRef={receipt}
        busy={preparing}
        problem={receiptProblem}
        hint="A photo or a PDF. A photo is made smaller before it's sent."
        onFile={(file, input) => void chooseReceipt(file, input)}
      />
    </ActionForm>
  );
}
