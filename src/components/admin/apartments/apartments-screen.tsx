"use client";

import { ActionForm } from "../action-form";
import { ConfirmButton, type ConfirmedActionResult } from "../confirm-button";
import { EmptyState } from "../empty-state";
import { PageHeader } from "../page-header";
import { Panel } from "../panel";
import { StatusPill } from "../status-pill";
import { useToast } from "../toast";
import { DateField, Select, TextField } from "@/components/ui/fields";
import { Notice } from "@/components/ui/notice";
import type { FormAction } from "@/lib/forms/form-state";
import type { FieldErrors } from "@/lib/kernel/result";

/** The unit form's rules, checked as each field is left; the server checks them again. */
function unitProblems(data: FormData): FieldErrors {
  return String(data.get("name") ?? "").trim() ? {} : { name: "Name the unit, like Unit 1." };
}

/** The closing form's rules, given today in Welkom. */
function closureProblems(today: string) {
  return (data: FormData): FieldErrors => {
    const arrive = String(data.get("arrive") ?? "");
    const leave = String(data.get("leave") ?? "");
    const errors: FieldErrors = {};
    if (!arrive) errors.arrive = "Choose the first night it's closed.";
    else if (arrive < today) errors.arrive = "Choose a first night from today onwards.";
    if (!leave) errors.leave = "Choose the day it's free again.";
    else if (arrive && leave <= arrive) errors.leave = "Choose a day after the first night.";
    return errors;
  };
}

export type UnitRow = { id: string; name: string; offered: boolean };

export type ApartmentGroup = { slug: string; name: string; shown: boolean; units: UnitRow[] };

export type ClosureRow = { id: string; unitName: string; apartmentName: string; nights: string; reason: string; note: string | null; removable: boolean };

type ApartmentsScreenProps = {
  apartments: readonly ApartmentGroup[];
  /** Units whose room type is no longer in the site's content. */
  orphans: readonly UnitRow[];
  closures: readonly ClosureRow[];
  /** Every offered unit, for the closure form: "Unit 1 (Family room with shower)". */
  unitOptions: readonly { value: string; label: string }[];
  today: string;
  canManage: boolean;
  actions: {
    addUnit: FormAction;
    closeNights: FormAction;
    setUnitOffered: (unitId: string, offered: boolean) => Promise<ConfirmedActionResult>;
    openNights: (blockId: string) => Promise<ConfirmedActionResult>;
  };
  websiteHref: string;
};

/**
 * The guesthouse's units (Pattern: settings list): each room type from the
 * website with the real rooms of that type, which the Book page
 * counts to say whether it's free; closing a unit for some nights; and the
 * closed nights ahead. Only the owner and sales can change them.
 */
export function ApartmentsScreen({ apartments, orphans, closures, unitOptions, today, canManage, actions, websiteHref }: ApartmentsScreenProps) {
  const toasts = useToast();
  const done = (message: string) => toasts?.show({ message });
  const noUnits = apartments.every((apartment) => apartment.units.length === 0);

  return (
    <>
      <PageHeader
        title="Rooms"
        description="The real rooms behind each room type on the website. The Book page shows a room type as free while one of its units is free for every night."
      />
      <div className="grid max-w-admin gap-8">
        {noUnits && (
          <Notice tone="info" live="off" title="No units yet">
            Until a room type has units here, the Book page can&apos;t show whether it&apos;s free: guests can still send a request, and you
            check by hand.
          </Notice>
        )}
        {orphans.length > 0 && (
          <Notice tone="warning" live="off" title="Units without a room type on the website">
            {orphans.map((unit) => unit.name).join(", ")}: their room type was renamed or removed on the website, so they aren&apos;t offered. Stop
            offering them and add new units under the right room type.
          </Notice>
        )}

        <section aria-labelledby="units-title" className="grid gap-4">
          <h2 id="units-title" className="text-h3 font-bold text-ink">
            Units
          </h2>
          <ul className="grid gap-4">
            {apartments.map((apartment) => (
              <li key={apartment.slug}>
                <Panel title={apartment.name} headingLevel={3} description={apartment.shown ? undefined : "Hidden on the website, so never offered."}>
                  {apartment.units.length > 0 ? (
                    <ul className="grid divide-y divide-hairline">
                      {apartment.units.map((unit) => (
                        <li key={unit.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                          <span className="flex items-center gap-2 font-bold text-ink">
                            {unit.name}
                            {!unit.offered && <StatusPill>Not offered</StatusPill>}
                          </span>
                          {canManage && (
                            <ConfirmButton
                              size="sm"
                              variant="ghost"
                              tone="primary"
                              title={unit.offered ? `Stop offering ${unit.name}?` : `Offer ${unit.name} again?`}
                              description={
                                unit.offered
                                  ? "The Book page stops counting it. Nights already closed in it stay closed."
                                  : "The Book page counts it again on every night it isn't closed."
                              }
                              confirmLabel={unit.offered ? "Stop offering" : "Offer again"}
                              pendingLabel="Saving…"
                              action={() => actions.setUnitOffered(unit.id, !unit.offered)}
                              onDone={() => done(unit.offered ? `${unit.name} is no longer offered` : `${unit.name} is offered again`)}
                            >
                              {unit.offered ? "Stop offering" : "Offer again"}
                            </ConfirmButton>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-fg-3">No units yet.</p>
                  )}
                </Panel>
              </li>
            ))}
          </ul>
          {apartments.length === 0 && (
            <EmptyState title="No room types on the website">
              Add room types in{" "}
              <a href={websiteHref} className="font-bold underline underline-offset-4">
                Website › Rooms
              </a>
              , then add their units here.
            </EmptyState>
          )}
        </section>

        {canManage && apartments.length > 0 && (
          <Panel title="Add a unit" description="One for each real room, named the way your team knows it. Guests never see these names.">
            <ActionForm action={actions.addUnit} validate={unitProblems} footer="button" submitLabel="Add unit" pendingLabel="Adding…" resetOnSave>
              <div className="grid gap-4 sm:grid-cols-2">
                <Select name="apartment" label="Room type" options={apartments.map((apartment) => ({ value: apartment.slug, label: apartment.name }))} />
                <TextField name="name" label="Unit name" maxLength={40} placeholder="e.g. Unit 3" />
              </div>
            </ActionForm>
          </Panel>
        )}

        {canManage && unitOptions.length > 0 && (
          <Panel title="Close a unit for some nights" description="For your own use or maintenance. Accepted booking requests close their nights by themselves.">
            <ActionForm
              action={actions.closeNights}
              validate={closureProblems(today)}
              footer="button"
              submitLabel="Close these nights"
              pendingLabel="Closing…"
              resetOnSave
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Select name="unitId" label="Unit" options={unitOptions} />
                <Select
                  name="reason"
                  label="Why"
                  options={[
                    { value: "owner", label: "Closed (own use)" },
                    { value: "maintenance", label: "Maintenance" },
                  ]}
                />
                <DateField name="arrive" label="First night closed" min={today} />
                <DateField name="leave" label="Free again from" min={today} hint="The morning it can be booked again." />
              </div>
              <TextField name="note" label="Note for the team" optional maxLength={200} />
            </ActionForm>
          </Panel>
        )}

        <section aria-labelledby="closed-title" className="grid gap-4">
          <h2 id="closed-title" className="text-h3 font-bold text-ink">
            Closed nights ahead
          </h2>
          {closures.length > 0 ? (
            <ul className="grid divide-y divide-hairline rounded-md border border-hairline bg-white">
              {closures.map((closure) => (
                <li key={closure.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="grid gap-0.5">
                    <p className="font-bold text-ink">
                      {closure.unitName} <span className="font-normal text-fg-2">· {closure.apartmentName}</span>
                    </p>
                    <p className="text-sm text-fg-2">
                      {closure.nights} · {closure.reason}
                      {closure.note && ` · ${closure.note}`}
                    </p>
                  </div>
                  {canManage && closure.removable && (
                    <ConfirmButton
                      size="sm"
                      variant="ghost"
                      tone="primary"
                      title={`Reopen these nights in ${closure.unitName}?`}
                      description="The Book page counts the unit as free on them again. You can close them again any time."
                      confirmLabel="Reopen nights"
                      pendingLabel="Reopening…"
                      action={() => actions.openNights(closure.id)}
                      onDone={() => done("Nights reopened")}
                    >
                      Reopen nights
                    </ConfirmButton>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-md border border-hairline bg-white px-4 py-3 text-sm text-fg-3">No nights are closed.</p>
          )}
        </section>
      </div>
    </>
  );
}
