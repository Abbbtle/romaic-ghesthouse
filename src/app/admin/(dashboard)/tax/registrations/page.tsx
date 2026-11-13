import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { StatusPill } from "@/components/admin/status-pill";
import { RegistrationSheet } from "@/components/admin/tax/registration-sheet";
import { TaxTabs } from "@/components/admin/tax/tax-tabs";
import { formatDateShort } from "@/lib/format/date-time";
import { businessTimeZone, zonedToday } from "@/lib/format/zoned-time";
import { legalFormNames, maskedReference, registrationHelp, registrationKinds, registrationNames, type Registration } from "@/lib/tax/registrations";
import { requireDashboardActor } from "@/server/admin-session";
import { taxService } from "@/server/tax";
import { recordRegistration } from "../actions";

export const metadata: Metadata = { title: "Tax registrations" };

function stateLine(registration: Registration | null): string {
  if (!registration) return "Not set. Treated as not registered until you record it.";
  if (!registration.registered) return `Not registered from ${formatDateShort(registration.effectiveFrom ?? "")}.`;
  return [
    `Registered from ${formatDateShort(registration.effectiveFrom ?? "")}`,
    registration.details.vatCategory ? `filing category ${registration.details.vatCategory}` : null,
    registration.details.legalForm ? legalFormNames[registration.details.legalForm] : null,
    maskedReference(registration.referenceLast4) ? `reference ${maskedReference(registration.referenceLast4)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The business's tax registrations (Pattern: settings): one row each, its
 * state in words, changed in a sheet. Each part of the Tax pages switches
 * on only once its registration is recorded. Owner only (tax:manage).
 */
export default async function TaxRegistrationsPage() {
  const actor = await requireDashboardActor({ permission: "tax:manage" });
  const { current, history } = await taxService().registrations(actor);
  const firstUnset = registrationKinds.find((kind) => !current[kind]);

  return (
    <>
      <PageHeader title="Registrations" description="Which taxes the business is registered for, and from when. Your accountant or eFiling has these details." />
      <TaxTabs current="registrations" />
      <div className="grid max-w-admin gap-6">
        <Panel flush>
          <ul className="divide-y divide-hairline">
            {registrationKinds.map((kind) => {
              const registration = current[kind];
              return (
                <li key={kind} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center lg:px-5">
                  <div className="grid min-w-0 gap-1">
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-bold text-ink">{registrationNames[kind]}</span>
                      {registration?.registered ? <StatusPill tone="success">Registered</StatusPill> : <StatusPill>{registration ? "Not registered" : "Not set"}</StatusPill>}
                    </p>
                    <p className="text-sm text-fg-2">{stateLine(registration)}</p>
                    <p className="text-sm text-fg-3">{registrationHelp[kind]}</p>
                  </div>
                  <RegistrationSheet
                    kind={kind}
                    name={registrationNames[kind]}
                    help={registrationHelp[kind]}
                    current={
                      registration
                        ? { registered: registration.registered, effectiveFrom: registration.effectiveFrom, vatCategory: registration.details.vatCategory ?? null, legalForm: registration.details.legalForm ?? null }
                        : null
                    }
                    action={recordRegistration}
                    primary={kind === firstUnset}
                  />
                </li>
              );
            })}
          </ul>
        </Panel>

        {history.length > 0 && (
          <Panel title="History" description="Every change, newest first. Reference numbers are kept encrypted." flush>
            <ul className="divide-y divide-hairline text-sm">
              {history.map((record) => (
                <li key={record.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-4 py-3 lg:px-5">
                  <span className="text-ink">
                    <span className="font-medium">{registrationNames[record.kind]}</span>: {stateLine(record)}
                  </span>
                  <span className="text-fg-3 tabular-nums">Recorded {formatDateShort(zonedToday(record.recordedAt, businessTimeZone))}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </>
  );
}
