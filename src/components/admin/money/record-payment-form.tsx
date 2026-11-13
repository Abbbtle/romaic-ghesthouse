"use client";

import { useState } from "react";
import { DateField, Select, TextField } from "@/components/ui/fields";
import type { FormAction } from "@/lib/forms/form-state";
import { parseWith } from "@/lib/forms/parse";
import type { FieldErrors } from "@/lib/kernel/result";
import { manualPaymentMethods, paymentKindNames, paymentKinds, paymentMethodNames } from "@/lib/money/money";
import { moneyLimits, recordPaymentSchema } from "@/lib/money/money-input";
import { ActionForm } from "../action-form";

/** The service's rules, as fields are left; it checks them all again. */
function problemsFor(today: string) {
  return (data: FormData): FieldErrors => {
    const parsed = parseWith(recordPaymentSchema, Object.fromEntries(data));
    const errors = parsed.ok ? {} : { ...parsed.errors };
    const receivedOn = String(data.get("receivedOn") ?? "");
    if (!errors.receivedOn && receivedOn > today) errors.receivedOn = "Choose today or an earlier day: record a payment once it's received.";
    return errors;
  };
}

/**
 * Records money received by hand: what it's for, how it came, how much, the
 * day, and any reference (the EFT reference, the card slip number). Its
 * receipt is numbered as it's saved. Refunds only show for the owner.
 */
export function RecordPaymentForm({
  bookingId,
  action,
  today,
  canRefund,
  defaultKind,
  firstKey,
  suggestedAmounts,
}: {
  bookingId: string;
  action: FormAction;
  today: string;
  canRefund: boolean;
  defaultKind: "deposit" | "balance";
  /** Filled into the amount when its kind is chosen (rand, "" for nothing): the deposit still owed, and the balance. */
  suggestedAmounts: { deposit: string; balance: string };
  /**
   * The key the first payment is sent with, made on the server so the page
   * hydrates as rendered; each save makes a fresh one. The same key twice (a
   * double-tap, a resend) records the payment once.
   */
  firstKey: string;
}) {
  const [key, setKey] = useState(firstKey);
  const [amount, setAmount] = useState(suggestedAmounts[defaultKind]);
  const suggest = (kind: string) => {
    if (kind === "deposit" || kind === "balance") setAmount(suggestedAmounts[kind]);
  };
  const kinds = paymentKinds.filter((kind) => kind !== "refund" || canRefund).map((kind) => ({ value: kind, label: paymentKindNames[kind] }));
  return (
    <ActionForm
      action={action}
      validate={problemsFor(today)}
      footer="button"
      submitLabel="Record payment"
      pendingLabel="Recording…"
      subject="this payment"
      resetOnSave
      onSaved={() => {
        setKey(crypto.randomUUID());
        setAmount("");
      }}
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="idempotencyKey" value={key} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select name="kind" label="What it's for" options={kinds} defaultValue={defaultKind} onValueChange={suggest} />
        <Select name="method" label="How it was paid" options={manualPaymentMethods.map((method) => ({ value: method, label: paymentMethodNames[method] }))} defaultValue="eft" />
        <TextField
          key={amount}
          name="amount"
          label="Amount (R)"
          inputMode="decimal"
          autoComplete="off"
          placeholder="e.g. 1250 or 1250.50"
          maxLength={16}
          defaultValue={amount}
        />
        <DateField name="receivedOn" label="Received on" defaultValue={today} max={today} />
        <TextField
          name="reference"
          label="Reference"
          optional
          maxLength={moneyLimits.referenceMax}
          hint="The EFT reference or card slip number, if there is one."
          className="sm:col-span-2"
        />
      </div>
    </ActionForm>
  );
}
