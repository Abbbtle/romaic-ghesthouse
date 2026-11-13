"use client";

import { ActionForm } from "../action-form";
import { DateField, FieldGroup, Select, TextArea, TextField } from "@/components/ui/fields";
import type { FormAction } from "@/lib/forms/form-state";
import type { FieldErrors } from "@/lib/kernel/result";
import { bookingSourceOptions } from "./booking-labels";
import type { UnitOption } from "./new-booking-form";

export type EditableBooking = {
  id: string;
  revision: number;
  unitId: string;
  arrive: string;
  leave: string;
  adults: number;
  children: number;
  total: string;
  depositDue: string;
  channel: string;
  externalRef: string;
  serviceNotes: string;
  notes: string;
};

function changeProblems(data: FormData): FieldErrors {
  const text = (name: string) => String(data.get(name) ?? "").trim();
  if (text("leave") && text("arrive") && text("leave") <= text("arrive")) return { leave: "Choose a leaving day after the arrival day." };
  return {};
}

const counts = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => ({ value: String(from + index), label: String(from + index) }));

/** Changing a booking: unit, dates, party, money and notes. Saved over the revision opened, so two people can't overwrite each other unseen. */
export function BookingEditForm({ action, booking, units }: { action: FormAction; booking: EditableBooking; units: readonly UnitOption[] }) {
  return (
    <ActionForm action={action} validate={changeProblems} subject="this booking">
      <input type="hidden" name="bookingId" value={booking.id} />
      <input type="hidden" name="revision" value={booking.revision} />
      <FieldGroup title="The stay" columns={2}>
        <Select name="unitId" label="Unit" options={units} defaultValue={booking.unitId} className="sm:col-span-2" />
        <DateField name="arrive" label="Arrives" defaultValue={booking.arrive} />
        <DateField name="leave" label="Leaves" defaultValue={booking.leave} />
        <Select name="adults" label="Adults" options={counts(1, 12)} defaultValue={String(booking.adults)} />
        <Select name="children" label="Children" options={counts(0, 11)} defaultValue={String(booking.children)} />
        <Select name="channel" label="Where it came from" options={bookingSourceOptions} defaultValue={booking.channel} />
        <TextField name="externalRef" label="The channel's booking number" optional maxLength={60} defaultValue={booking.externalRef} />
      </FieldGroup>
      <FieldGroup title="Money" columns={2}>
        <TextField name="total" label="Total for the stay (R)" inputMode="decimal" defaultValue={booking.total} />
        <TextField name="depositDue" label="Deposit due (R)" inputMode="decimal" defaultValue={booking.depositDue} />
      </FieldGroup>
      <FieldGroup title="Notes">
        <TextArea name="serviceNotes" label="For the team" optional rows={2} maxLength={300} defaultValue={booking.serviceNotes} hint="Staff see this." />
        <TextArea name="notes" label="Private" optional rows={3} maxLength={1000} defaultValue={booking.notes} hint="Only the owner and sales see this." />
      </FieldGroup>
    </ActionForm>
  );
}
