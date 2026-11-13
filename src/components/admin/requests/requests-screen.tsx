"use client";

import { Mail, MessageCircle, Phone } from "lucide-react";
import { useState } from "react";
import { ConfirmButton, type ConfirmedActionResult } from "../confirm-button";
import { EmptyState } from "../empty-state";
import { PageHeader } from "../page-header";
import { StatusPill, type StatusTone } from "../status-pill";
import { Tabs } from "../tabs";
import { useToast } from "../toast";
import { Select, TextField } from "@/components/ui/fields";
import { Notice } from "@/components/ui/notice";


/** One request as the dashboard shows it: every value already worded for the screen. */
export type RequestRow = {
  id: string;
  ref: string;
  apartmentName: string;
  stay: string;
  guests: string;
  name: string;
  phone: { display: string; tel: string };
  /** WhatsApp to the guest, opening with a reply that names the reference. */
  whatsapp: string;
  email: string | null;
  arrivalTime: string | null;
  notes: string | null;
  sent: string;
  status: { label: string; tone: StatusTone };
  /** For handled requests: when, and the note or unit. */
  decision: string | null;
  /** Waiting requests only: the units free for every night, and whether the apartment has any units at all. */
  freeUnits: { id: string; name: string }[];
  hasUnits: boolean;
  /** The total the rates give for this stay, for the accept form ("" when there's no rate). */
  suggestedTotal: string;
  /** For an accepted request: its booking's page. */
  bookingHref: string | null;
  consent: string;
};

type RequestsScreenProps = {
  list: "waiting" | "handled";
  rows: readonly RequestRow[];
  waitingCount: number;
  canAccept: boolean;
  canDecline: boolean;
  acceptAction: (requestId: string, terms: { unitId: string; total: string; depositDue: string }) => Promise<ConfirmedActionResult>;
  declineAction: (requestId: string) => Promise<ConfirmedActionResult>;
  apartmentsHref: string;
  /** The website's Book page, for the empty inbox. */
  bookPageHref: string;
  /** Each tab's address. */
  hrefs: { waiting: string; handled: string };
};

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs font-bold text-fg-3">{label}</dt>
      <dd className="text-sm text-fg">{children}</dd>
    </div>
  );
}

function RequestCard({
  row,
  list,
  canAccept,
  canDecline,
  acceptAction,
  declineAction,
  apartmentsHref,
}: Omit<RequestsScreenProps, "rows" | "waitingCount" | "hrefs" | "bookPageHref"> & { row: RequestRow }) {
  const toasts = useToast();
  const [unitId, setUnitId] = useState(row.freeUnits[0]?.id ?? "");
  const [total, setTotal] = useState(row.suggestedTotal);
  const [depositDue, setDepositDue] = useState("0");
  const unitName = row.freeUnits.find((unit) => unit.id === unitId)?.name ?? "the unit";
  return (
    <li className="grid gap-4 rounded-md border border-hairline bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="grid gap-1">
          <h2 className="text-h4 font-bold text-ink">
            {row.name} <span className="font-normal text-fg-2">· {row.guests}</span>
          </h2>
          <p className="text-sm text-fg-2">
            <strong className="text-ink">{row.apartmentName}</strong> · {row.stay}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-bold tracking-wider text-fg-2">{row.ref}</span>
          <StatusPill tone={row.status.tone}>{row.status.label}</StatusPill>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1">
        <a href={row.whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-link underline underline-offset-4">
          <MessageCircle aria-hidden="true" strokeWidth={1.75} className="size-4" />
          WhatsApp {row.phone.display}
        </a>
        <a href={row.phone.tel} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-link underline underline-offset-4">
          <Phone aria-hidden="true" strokeWidth={1.75} className="size-4" />
          Call
        </a>
        {row.email && (
          <a href={`mailto:${row.email}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold break-all text-link underline underline-offset-4">
            <Mail aria-hidden="true" strokeWidth={1.75} className="size-4" />
            {row.email}
          </a>
        )}
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        {row.arrivalTime && <Detail label="Arriving about">{row.arrivalTime}</Detail>}
        <Detail label="Sent">{row.sent}</Detail>
        {row.notes && (
          <div className="sm:col-span-2">
            <Detail label="Their note">
              <span className="whitespace-pre-line">{row.notes}</span>
            </Detail>
          </div>
        )}
        {row.decision && <Detail label="Decision">{row.decision}</Detail>}
        <Detail label="What they agreed to">{row.consent}</Detail>
      </dl>

      {list === "waiting" && (canAccept || canDecline) && (
        <div className="grid gap-3 border-t border-hairline pt-4">
          {canAccept &&
            (row.freeUnits.length > 0 ? (
              <div className="grid gap-3">
                <Select
                  name={`unit-${row.id}`}
                  label="Unit"
                  options={row.freeUnits.map((unit) => ({ value: unit.id, label: unit.name }))}
                  defaultValue={row.freeUnits[0]?.id}
                  onValueChange={setUnitId}
                  hint="Free for every night of this stay."
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    name={`total-${row.id}`}
                    label="Total for the stay (R)"
                    inputMode="decimal"
                    defaultValue={row.suggestedTotal}
                    onValueChange={setTotal}
                    hint={row.suggestedTotal ? "From your rates. Change it if you agreed another price." : "No rate set for this apartment: enter the price you'll quote."}
                  />
                  <TextField name={`deposit-${row.id}`} label="Deposit due (R)" inputMode="decimal" defaultValue="0" onValueChange={setDepositDue} />
                </div>
                <div>
                  <ConfirmButton
                    variant="primary"
                    tone="primary"
                    title={`Accept ${row.name}'s request into ${unitName}?`}
                    description={`${row.stay}. These nights close in ${unitName} for everyone else. You can cancel it later from Handled. Nothing is sent to the guest: reply on WhatsApp or by email.`}
                    confirmLabel="Accept request"
                    pendingLabel="Accepting…"
                    action={() => acceptAction(row.id, { unitId, total, depositDue })}
                    onDone={() => toasts?.show({ message: `${row.ref} accepted into ${unitName}` })}
                  >
                    Accept
                  </ConfirmButton>
                </div>
              </div>
            ) : (
              <Notice tone="warning" live="off">
                {row.hasUnits
                  ? "No unit of this apartment is free for every night of this stay. Decline it, or WhatsApp the guest to offer something else."
                  : "This apartment has no units set up yet, so it can't be accepted here."}{" "}
                <a href={apartmentsHref} className="font-bold underline underline-offset-4">
                  Go to Apartments
                </a>
              </Notice>
            ))}
          {canDecline && (
            <div>
              <ConfirmButton
                size="sm"
                title={`Decline ${row.name}'s request?`}
                description="The apartment stays open to others. Nothing is sent to the guest: let them know on WhatsApp or by email."
                confirmLabel="Decline request"
                pendingLabel="Declining…"
                action={() => declineAction(row.id)}
                onDone={() => toasts?.show({ message: `${row.ref} declined` })}
              >
                Decline
              </ConfirmButton>
            </div>
          )}
        </div>
      )}

      {list === "handled" && row.bookingHref && (
        <div className="border-t border-hairline pt-4">
          <a href={row.bookingHref} className="inline-flex min-h-11 items-center font-bold text-link underline underline-offset-4">
            Open the booking
          </a>
        </div>
      )}
    </li>
  );
}

/**
 * Booking requests from the Book page (Pattern: inbox). Waiting requests
 * first, soonest arrival at the top, each with the guest's contact links, the
 * units free for its nights and Accept or Decline; handled ones under their
 * own tab. Nothing here messages the guest: the WhatsApp link opens a reply
 * for the person to send.
 */
export function RequestsScreen({ list, rows, waitingCount, hrefs, bookPageHref, ...card }: RequestsScreenProps) {
  return (
    <>
      <PageHeader title="Booking requests" description="Requests from the website's Book page. Accept one into a unit, or decline it, then reply to the guest." />
      <div className="grid max-w-admin gap-6">
        <Tabs
          label="Requests"
          current={hrefs[list]}
          items={[
            { href: hrefs.waiting, label: "Waiting", count: waitingCount },
            { href: hrefs.handled, label: "Handled" },
          ]}
        />
        {rows.length > 0 ? (
          <ul aria-label={list === "waiting" ? "Waiting requests" : "Handled requests"} className="grid gap-4">
            {rows.map((row) => (
              <RequestCard key={row.id} row={row} list={list} {...card} />
            ))}
          </ul>
        ) : (
          <EmptyState
            title={list === "waiting" ? "No requests waiting" : "Nothing handled yet"}
            actions={
              list === "waiting" ? (
                <a href={bookPageHref} target="_blank" rel="noopener noreferrer" className="font-bold text-link underline underline-offset-4">
                  See the website&apos;s Book page
                </a>
              ) : undefined
            }
          >
            {list === "waiting"
              ? "New requests from the website's Book page appear here."
              : "Requests you accept or decline, and ones that expired unanswered, appear here for 90 days."}
          </EmptyState>
        )}
      </div>
    </>
  );
}
