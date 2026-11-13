"use client";

import { Calculator } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { ActionForm } from "../action-form";
import { callServerAction } from "../server-call";
import { DateField, FieldGroup, PhoneField, Select, TextArea, TextField } from "@/components/ui/fields";
import { centsForInput } from "@/lib/format/money";
import type { FormAction } from "@/lib/forms/form-state";
import type { FieldErrors } from "@/lib/kernel/result";
import { bookingSourceOptions } from "./booking-labels";

export type UnitOption = { value: string; label: string };

/** A stay imported from a channel's calendar that the booking is made from: its unit, nights and channel fill the form. */
export type ChannelStayPrefill = { id: string; unitId: string; arrive: string; leave: string; channel: string; channelName: string; summary: string };

type QuoteAction = (unitId: string, arrive: string, leave: string, guests: number) => Promise<{ status: "quote"; cents: number | null } | { status: string }>;

/** Quick checks as fields are left; the server checks everything again. */
function newBookingProblems(data: FormData): FieldErrors {
  const text = (name: string) => String(data.get(name) ?? "").trim();
  const errors: FieldErrors = {};
  if (!text("arrive")) errors.arrive = "Choose the arrival day.";
  if (!text("leave")) errors.leave = "Choose the leaving day.";
  else if (text("arrive") && text("leave") <= text("arrive")) errors.leave = "Choose a leaving day after the arrival day.";
  if (!text("guestId")) {
    if (!text("guestName")) errors.guestName = "Enter the guest's name.";
    if (!text("guestPhone") && !text("guestEmail")) errors.guestPhone = "Enter a phone number or an email address, so you can reach the guest.";
  }
  if (!/^\d+([.,]\d{1,2})?$/.test(text("total").replace(/[\sR,]/g, "") || "x")) errors.total = "Enter the total in rand, like 1250, or 0.";
  return errors;
}

const counts = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => ({ value: String(from + index), label: String(from + index) }));

/**
 * A booking taken by phone, at the gate or typed in from a channel: the
 * unit, the stay, who's coming, the guest (an existing one when coming from
 * their page), the money and the notes. "Use the rates" fills the total from
 * the rates for the unit and dates chosen.
 */
export function NewBookingForm({
  action,
  quote,
  units,
  guest,
  fromChannel = null,
  today,
}: {
  action: FormAction;
  quote: QuoteAction;
  units: readonly UnitOption[];
  /** An existing guest the booking is for. */
  guest: { id: string; name: string } | null;
  fromChannel?: ChannelStayPrefill | null;
  today: string;
}) {
  const [quoteNote, setQuoteNote] = useState<string | null>(null);

  async function useRates(event: MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    if (!form) return;
    const value = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null)?.value ?? "";
    const guests = Number(value("adults") || 1) + Number(value("children") || 0);
    const result = await callServerAction(
      () => quote(value("unitId"), value("arrive"), value("leave"), guests),
      () => ({ status: "unreachable" }),
    );
    const cents = "cents" in result ? (result.cents as number | null) : null;
    if (cents === null) {
      setQuoteNote("There's no rate for this unit and these dates. Enter the price you agreed.");
      return;
    }
    const total = form.elements.namedItem("total") as HTMLInputElement | null;
    if (total) total.value = centsForInput(cents);
    setQuoteNote("Filled in from your rates. Change it if you agreed another price.");
  }

  return (
    <ActionForm action={action} validate={newBookingProblems} footer="button" submitLabel="Make the booking" pendingLabel="Booking…" subject="this booking">
      {fromChannel && (
        <>
          <input type="hidden" name="channelStayId" value={fromChannel.id} />
          <input type="hidden" name="channel" value={fromChannel.channel} />
          <p className="rounded-sm border border-hairline bg-surface-2 p-3 text-sm text-fg">
            From {fromChannel.channelName}&apos;s calendar: {fromChannel.summary}. Add the guest&apos;s details and the price from {fromChannel.channelName}. Making the booking replaces the
            calendar&apos;s hold on these nights.
          </p>
        </>
      )}
      <FieldGroup title="The stay" columns={2}>
        <Select name="unitId" label="Unit" options={units} defaultValue={fromChannel?.unitId} className="sm:col-span-2" />
        <DateField name="arrive" label="Arrives" min={fromChannel ? undefined : today} defaultValue={fromChannel?.arrive} />
        <DateField name="leave" label="Leaves" min={fromChannel ? undefined : today} defaultValue={fromChannel?.leave} />
        <Select name="adults" label="Adults" options={counts(1, 12)} defaultValue="2" />
        <Select name="children" label="Children" options={counts(0, 11)} defaultValue="0" />
        {!fromChannel && <Select name="channel" label="Where it came from" options={bookingSourceOptions} defaultValue="phone" className="sm:col-span-2" />}
        <TextField name="externalRef" label={fromChannel ? `${fromChannel.channelName}'s booking number` : "The channel's booking number"} optional maxLength={60} className="sm:col-span-2" />
      </FieldGroup>

      <FieldGroup title="The guest" columns={2}>
        {guest ? (
          <>
            <input type="hidden" name="guestId" value={guest.id} />
            <p className="text-base text-ink sm:col-span-2">
              For <strong>{guest.name}</strong>, from their guest record.
            </p>
          </>
        ) : (
          <>
            <TextField name="guestName" label="Name" autoComplete="off" maxLength={80} className="sm:col-span-2" />
            <PhoneField name="guestPhone" label="Mobile number" optional hint="For WhatsApp. A phone or an email is needed." />
            <TextField name="guestEmail" type="email" label="Email" optional inputMode="email" autoComplete="off" />
          </>
        )}
      </FieldGroup>

      <FieldGroup title="Money" columns={2}>
        <div className="grid gap-2">
          <TextField name="total" label="Total for the stay (R)" inputMode="decimal" defaultValue="" placeholder="e.g. 2400" />
          <button type="button" onClick={useRates} className="inline-flex min-h-11 items-center gap-2 justify-self-start text-sm font-bold text-link underline underline-offset-4">
            <Calculator aria-hidden="true" strokeWidth={1.75} className="size-4" />
            Use the rates
          </button>
          {quoteNote && (
            <p role="status" className="text-sm text-fg-2">
              {quoteNote}
            </p>
          )}
        </div>
        <TextField name="depositDue" label="Deposit due (R)" inputMode="decimal" defaultValue="0" />
      </FieldGroup>

      <FieldGroup title="Notes">
        <TextArea name="serviceNotes" label="For the team" optional rows={2} maxLength={300} hint="Staff see this: a late arrival, extra towels. No contact details or money." />
        <TextArea name="notes" label="Private" optional rows={3} maxLength={1000} hint="Only the owner and sales see this." />
      </FieldGroup>
    </ActionForm>
  );
}
