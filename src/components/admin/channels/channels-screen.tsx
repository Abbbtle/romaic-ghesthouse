"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { ActionForm } from "../action-form";
import { ConfirmButton, type ConfirmedActionResult } from "../confirm-button";
import { EmptyState } from "../empty-state";
import { PageHeader } from "../page-header";
import { Panel } from "../panel";
import { callServerAction } from "../server-call";
import { StatusPill, type StatusTone } from "../status-pill";
import { useToast } from "../toast";
import { CopyLink } from "./copy-link";
import { Button } from "@/components/ui/button";
import { Select, Switch, TextField, type FieldOption } from "@/components/ui/fields";
import { calendarUrlProblem } from "@/lib/channels/channels";
import { failedState, idleFormState, type FormAction } from "@/lib/forms/form-state";
import type { FieldErrors } from "@/lib/kernel/result";

export type CalendarRow = {
  id: string;
  channelName: string;
  /** Calendars of a channel that's off aren't synced. */
  channelActive: boolean;
  /** The saved link's host: the link itself never comes back to the browser. */
  host: string;
  status: { label: string; tone: StatusTone };
  /** "Today at 08:00", or "Never". */
  lastSynced: string;
  /** "2 new · 0 changed · 1 gone", or null. */
  lastRun: string | null;
  lastError: string | null;
};

/** A unit's feed links, one per channel that's on. */
export type FeedRow = { links: { channelName: string; url: string }[]; made: string | null };

export type UnitChannelsRow = {
  id: string;
  name: string;
  calendars: CalendarRow[];
  /** Channels that are on and have no calendar for this unit yet. */
  availableChannels: FieldOption[];
  /** Undefined when the person may not see feed links; null when the unit has none yet. */
  feed: FeedRow | null | undefined;
};

export type ChannelRow = { key: string; name: string; active: boolean };

export type AttentionRow = {
  id: string;
  unitName: string;
  channelName: string;
  stay: string;
  kind: "conflict" | "gone" | "changed";
  note: string | null;
  /** Where to make a booking from this stay, for those who may (a conflict only); null otherwise. */
  bookHref: string | null;
  /** The booking it became, for those who may see bookings; null otherwise. */
  bookingHref: string | null;
};

type ChannelsScreenProps = {
  attention: readonly AttentionRow[];
  units: readonly UnitChannelsRow[];
  channels: readonly ChannelRow[];
  /** May change calendar links and see feed links now: the owner or admin, with a recent step-up. */
  canConfigure: boolean;
  /** For the owner or admin without a recent step-up: where to confirm their password and code first. */
  confirmHref: string | null;
  calendarCount: number;
  actions: {
    syncCalendar: (calendarId: string) => Promise<ConfirmedActionResult>;
    syncAll: () => Promise<ConfirmedActionResult>;
    addCalendar: FormAction;
    changeCalendarUrl: FormAction;
    removeCalendar: (calendarId: string) => Promise<ConfirmedActionResult>;
    resetFeed: (unitId: string) => Promise<ConfirmedActionResult>;
    updateChannel: FormAction;
  };
};

const connectionFailure = "That didn't go through. Check your connection and try again.";

function problemOf(result: ConfirmedActionResult): string | null {
  if (!result) return null;
  switch (result.status) {
    case "failed":
      return result.message;
    case "invalid":
      return Object.values(result.errors)[0] ?? "That didn't work. Reload the page and try again.";
    case "signed-out":
      return "You've been signed out. Sign in again in another tab, then try again.";
    case "step-up":
      return "For your security, reload the page and confirm your password and code, then try again.";
    default:
      return null;
  }
}

/** A one-tap action (Sync now, Make feed link): the server's message in a toast, or the problem beside the button. */
function useQuickAction() {
  const toasts = useToast();
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const run = (call: () => Promise<ConfirmedActionResult>) =>
    startTransition(async () => {
      setProblem(null);
      const result = await callServerAction(call, () => failedState(connectionFailure));
      const found = problemOf(result);
      if (found) setProblem(found);
      else toasts?.show({ message: result && result.status === "saved" ? result.message : "Done" });
    });
  return { pending, problem, run };
}

function QuickButton({ call, label, pendingLabel, variant = "secondary" }: { call: () => Promise<ConfirmedActionResult>; label: string; pendingLabel: string; variant?: "secondary" | "primary" }) {
  const { pending, problem, run } = useQuickAction();
  return (
    <div className="grid gap-1">
      <div>
        <Button size="sm" variant={variant} icon={<RefreshCw aria-hidden="true" />} pending={pending} pendingLabel={pendingLabel} onClick={() => run(call)}>
          {label}
        </Button>
      </div>
      <p role="status" className={problem ? "text-sm text-danger-700" : "sr-only"}>
        {problem ?? ""}
      </p>
    </div>
  );
}

/** The add-calendar and change-link forms' rules, checked as each field is left; the server checks them again. */
function calendarProblems(data: FormData): FieldErrors {
  const errors: FieldErrors = {};
  if (data.has("channel") && !String(data.get("channel") ?? "")) errors.channel = "Choose the channel.";
  const url = String(data.get("url") ?? "").trim();
  const problem = url ? calendarUrlProblem(url) : "Paste the calendar link.";
  if (problem) errors.url = problem;
  return errors;
}

const urlHint = "Paste the channel's iCal export link for this unit. It's kept encrypted and never shown again: only its address.";

function attentionText(row: AttentionRow): string {
  if (row.kind === "conflict") {
    return `${row.channelName} has a stay on nights that are already taken here: a double booking. ${row.note ?? ""} Close these nights on ${row.channelName}, or move one of the stays.`.replace(/\s+/g, " ").trim();
  }
  return row.note ?? (row.kind === "gone" ? `No longer on ${row.channelName}'s calendar. Check the booking.` : "The dates changed on the channel. Check the booking.");
}

function CalendarItem({ calendar, canConfigure, actions }: { calendar: CalendarRow; canConfigure: boolean; actions: ChannelsScreenProps["actions"] }) {
  const toasts = useToast();
  return (
    <li className="grid gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-base font-bold text-ink">{calendar.channelName}</h4>
        <StatusPill tone={calendar.status.tone}>{calendar.status.label}</StatusPill>
        {!calendar.channelActive && <StatusPill>Channel off: not synced</StatusPill>}
      </div>
      <dl className="grid gap-1 text-sm text-fg-2 sm:grid-cols-[auto_1fr] sm:gap-x-4">
        <dt className="font-medium text-fg">Link</dt>
        <dd>{calendar.host} · saved</dd>
        <dt className="font-medium text-fg">Last synced</dt>
        <dd>
          {calendar.lastSynced}
          {calendar.lastRun ? ` · ${calendar.lastRun}` : ""}
        </dd>
      </dl>
      {calendar.lastError && <p className="text-sm text-danger-700">{calendar.lastError}</p>}
      <div className="flex flex-wrap items-start gap-3">
        {calendar.channelActive && <QuickButton call={() => actions.syncCalendar(calendar.id)} label="Sync now" pendingLabel="Syncing…" />}
        {canConfigure && (
          <ConfirmButton
            size="sm"
            variant="ghost"
            tone="primary"
            title={`Remove the ${calendar.channelName} calendar?`}
            description={`Its imported stays, and the nights they held here, go. Bookings already made from them stay. ${calendar.channelName} still has its own bookings.`}
            confirmLabel="Remove calendar"
            pendingLabel="Removing…"
            action={() => actions.removeCalendar(calendar.id)}
            onDone={() => toasts?.show({ message: `${calendar.channelName} calendar removed` })}
          >
            Remove
          </ConfirmButton>
        )}
      </div>
      {canConfigure && (
        <details>
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-bold text-link underline underline-offset-4">Change link</summary>
          <div className="pt-3">
            <ActionForm action={actions.changeCalendarUrl} validate={calendarProblems} footer="button" submitLabel="Save new link" pendingLabel="Saving…" resetOnSave>
              <input type="hidden" name="calendarId" value={calendar.id} />
              <TextField name="url" type="url" label="New calendar link" inputMode="url" autoComplete="off" maxLength={2000} placeholder="https://" hint={urlHint} />
            </ActionForm>
          </div>
        </details>
      )}
    </li>
  );
}

function FeedSection({ unit, feed, resetFeed }: { unit: UnitChannelsRow; feed: FeedRow | null; resetFeed: ChannelsScreenProps["actions"]["resetFeed"] }) {
  const toasts = useToast();
  return (
    <section aria-labelledby={`feed-${unit.id}`} className="grid gap-3">
      <div className="grid gap-1">
        <h4 id={`feed-${unit.id}`} className="text-base font-bold text-ink">
          Calendar feed for channels
        </h4>
        <p className="text-sm text-fg-2">
          Paste each link into that channel&apos;s calendar import settings for {unit.name}. It lists the nights the unit isn&apos;t free, as &ldquo;Not available&rdquo;: no
          names, notes or prices. Each channel gets its own link, which leaves out the stays that came from it.
        </p>
      </div>
      {feed === null ? (
        <QuickButton call={() => resetFeed(unit.id)} label="Make feed link" pendingLabel="Making…" />
      ) : (
        <>
          {feed.links.length === 0 ? (
            <p className="text-sm text-fg-3">Turn on a channel below to get its link.</p>
          ) : (
            <div className="grid gap-4">
              {feed.links.map((link) => (
                <CopyLink key={link.channelName} label={`Link for ${link.channelName}`} url={link.url} />
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {feed.made && <p className="text-sm text-fg-3">Made {feed.made.charAt(0).toLowerCase() + feed.made.slice(1)}.</p>}
            <ConfirmButton
              size="sm"
              variant="ghost"
              tone="danger"
              title={`Make new feed links for ${unit.name}?`}
              description="The current links stop working at once. Until you paste the new link into every channel, they won't see this unit's busy nights. Do this only if a link was shared by mistake."
              confirmLabel="Make new links"
              pendingLabel="Making…"
              action={() => resetFeed(unit.id)}
              onDone={() => toasts?.show({ message: `New feed links for ${unit.name}. Paste them into each channel.` })}
            >
              Make new links
            </ConfirmButton>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * One channel as a row: its switch saves as it's flipped (with Undo in the
 * toast), and its name is renamed in place: the name becomes a field of the
 * same height, with Save and Cancel where Rename was, so the rows below
 * never move. A problem shows in a toast for the same reason.
 */
function ChannelItem({ channel, update }: { channel: ChannelRow; update: FormAction }) {
  const toasts = useToast();
  const [active, setActive] = useState(channel.active);
  const [name, setName] = useState(channel.name);
  const [renaming, setRenaming] = useState(false);
  const [saving, startSaving] = useTransition();
  const renameButton = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);

  async function send(next: { active: boolean; name: string }) {
    const data = new FormData();
    data.set("channel", channel.key);
    data.set("name", next.name);
    if (next.active) data.set("active", "on");
    return callServerAction(
      () => update(idleFormState, data),
      () => failedState("That didn't save: check your connection and try again."),
    );
  }

  const problemOf = (result: Awaited<ReturnType<typeof send>>) =>
    result.status === "failed" ? result.message : result.status === "invalid" ? (Object.values(result.errors)[0] ?? "Check the name.") : null;

  function toggle(next: boolean, offerUndo: boolean) {
    setActive(next);
    startSaving(async () => {
      const result = await send({ active: next, name });
      const problem = problemOf(result);
      if (problem) {
        setActive(!next);
        toasts?.show({ message: problem, tone: "error" });
        return;
      }
      toasts?.show({ message: `${name} ${next ? "is on" : "is off"}`, action: offerUndo ? { label: "Undo", onSelect: () => toggle(!next, false) } : undefined });
    });
  }

  function finishRenaming() {
    setRenaming(false);
    requestAnimationFrame(() => renameButton.current?.focus());
  }

  function rename() {
    const typed = field.current?.value.trim() ?? "";
    if (!typed) {
      toasts?.show({ message: "Enter the channel's name.", tone: "error" });
      field.current?.focus();
      return;
    }
    startSaving(async () => {
      const result = await send({ active, name: typed });
      const problem = problemOf(result);
      if (problem) {
        toasts?.show({ message: problem, tone: "error" });
        field.current?.focus();
        return;
      }
      setName(typed);
      finishRenaming();
      toasts?.show({ message: "Channel renamed" });
    });
  }

  return (
    <li className="flex h-16 items-center justify-between gap-3 px-4 lg:px-5">
      {renaming ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            rename();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") finishRenaming();
          }}
        >
          <label htmlFor={`channel-name-${channel.key}`} className="sr-only">
            Name of {name}
          </label>
          <input
            ref={field}
            id={`channel-name-${channel.key}`}
            defaultValue={name}
            maxLength={40}
            autoFocus
            className="h-10 min-w-0 flex-1 rounded-sm border border-control bg-field px-3 text-base text-fg focus:border-focus"
          />
          <Button type="submit" size="sm" variant="secondary" pending={saving} pendingLabel="Saving…">
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={finishRenaming}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <h3 className="truncate text-base font-bold text-ink">{name}</h3>
          <Button ref={renameButton} type="button" size="sm" variant="ghost" onClick={() => setRenaming(true)}>
            Rename
            <span className="sr-only"> {name}</span>
          </Button>
        </div>
      )}
      {!renaming && (
        <Switch key={String(active)} name={`active-${channel.key}`} label={`Sync ${name}`} hideLabel defaultChecked={active} onLabel="On" offLabel="Off" onCheckedChange={(checked) => toggle(checked, true)} />
      )}
    </li>
  );
}

/**
 * Channels (Pattern: settings list). The stays needing someone come first;
 * then each unit's imported calendars, with "Sync now", and, for the owner
 * and admin, the calendar links and the unit's feed links; then the
 * channels themselves. iCal carries dates only, and neither side is live,
 * so the page says how it works in plain words.
 */
export function ChannelsScreen({ attention, units, channels, canConfigure, confirmHref, calendarCount, actions }: ChannelsScreenProps) {
  const anyActive = channels.some((channel) => channel.active);

  return (
    <>
      <PageHeader
        title="Channels"
        description="Booking.com and the other channels, kept in step with your calendar by iCal."
        actions={calendarCount > 0 ? <QuickButton call={actions.syncAll} label="Sync all now" pendingLabel="Syncing…" /> : undefined}
      />
      <div className="grid max-w-admin gap-8">
        {attention.length > 0 && (
          <section aria-labelledby="attention-title" className="grid gap-3 rounded-md border border-warning-100 bg-warning-50 p-4 lg:p-5">
            <h2 id="attention-title" className="flex items-center gap-2 text-h3 font-bold text-ink">
              <TriangleAlert aria-hidden="true" strokeWidth={1.75} className="size-5 shrink-0 text-warning-800" />
              Needs attention ({attention.length})
            </h2>
            <ul className="grid gap-2">
              {attention.map((row) => (
                <li key={row.id} className="grid gap-1 rounded-sm border border-hairline bg-white p-3">
                  <p className="flex flex-wrap items-center gap-2 font-bold text-ink">
                    {row.unitName} · {row.stay}
                    <StatusPill tone={row.kind === "conflict" ? "danger" : "warning"}>
                      {row.kind === "conflict" ? "Double booking" : row.kind === "gone" ? "Gone from the channel" : "Dates changed"}
                    </StatusPill>
                  </p>
                  <p className="text-sm text-fg-2">{attentionText(row)}</p>
                  {(row.bookHref || row.bookingHref) && (
                    <Link href={(row.bookHref ?? row.bookingHref)!} className="inline-flex min-h-11 items-center justify-self-start text-sm font-bold text-link underline underline-offset-4">
                      {row.bookHref ? "Make it a booking in another unit" : "Open the booking"}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <details className="rounded-md border border-hairline bg-white px-4 py-1 lg:px-5">
          <summary className="flex min-h-11 cursor-pointer items-center font-bold text-ink">How calendars stay in step</summary>
          <ul className="grid list-disc gap-1 pb-4 pl-5 text-sm text-fg-2">
            <li>iCal shares dates only: no guest names, prices or contact details. Complete each channel stay as a booking from the channel&apos;s extranet.</li>
            <li>Channels read your feed links on their own schedule, which we don&apos;t control, so a change here doesn&apos;t show there at once.</li>
            <li>
              We read the channels&apos; calendars when someone presses Sync now, and once a day automatically. Reading them more often needs a hosting decision: ask
              Weberu.
            </li>
            <li>Between syncs, a double booking can happen. When it does, it shows under Needs attention.</li>
          </ul>
        </details>

        <section aria-labelledby="units-title" className="grid gap-4">
          <h2 id="units-title" className="text-h3 font-bold text-ink">
            Units
          </h2>
          {units.length === 0 && <EmptyState title="No units yet">Add the rooms&apos; units first, then connect their channel calendars here.</EmptyState>}
          {confirmHref ? (
            <p className="text-sm text-fg-2">
              To change calendar links or see feed links, confirm your password and code first.{" "}
              <a href={confirmHref} className="inline-flex min-h-11 items-center font-bold text-link underline underline-offset-4">
                Confirm it&apos;s you
              </a>
            </p>
          ) : (
            !canConfigure && <p className="text-sm text-fg-3">Only the owner and Weberu can change calendar links and feed links.</p>
          )}
          <ul className="grid gap-4">
            {units.map((unit) => (
              <li key={unit.id}>
                <Panel title={unit.name} headingLevel={3} description={unit.calendars.length === 0 ? "No channel calendars yet." : undefined}>
                  <div className="grid gap-6">
                    {unit.calendars.length > 0 && (
                      <ul className="grid divide-y divide-hairline" aria-label={`${unit.name}: imported calendars`}>
                        {unit.calendars.map((calendar) => (
                          <CalendarItem key={calendar.id} calendar={calendar} canConfigure={canConfigure} actions={actions} />
                        ))}
                      </ul>
                    )}
                    {canConfigure && unit.availableChannels.length > 0 && (
                      <details className={unit.calendars.length > 0 ? "border-t border-hairline pt-2" : undefined}>
                        <summary className="inline-flex min-h-11 cursor-pointer items-center font-bold text-link underline underline-offset-4">Add a channel calendar</summary>
                        <div className="pt-3">
                          <ActionForm action={actions.addCalendar} validate={calendarProblems} footer="button" submitLabel="Save calendar link" pendingLabel="Saving…" resetOnSave>
                            <input type="hidden" name="unitId" value={unit.id} />
                            <Select name="channel" label="Channel" options={unit.availableChannels} placeholder="Choose the channel" />
                            <TextField name="url" type="url" label="Calendar link" inputMode="url" autoComplete="off" maxLength={2000} placeholder="https://" hint={urlHint} />
                          </ActionForm>
                        </div>
                      </details>
                    )}
                    {canConfigure && !anyActive && <p className="text-sm text-fg-3">Turn on a channel below to connect its calendar.</p>}
                    {unit.feed !== undefined && <FeedSection unit={unit} feed={unit.feed} resetFeed={actions.resetFeed} />}
                  </div>
                </Panel>
              </li>
            ))}
          </ul>
        </section>

        {canConfigure && (
          <section aria-labelledby="channels-title" className="grid gap-4">
            <div className="grid gap-1">
              <h2 id="channels-title" className="text-h3 font-bold text-ink">
                Channels
              </h2>
              <p className="text-sm text-fg-2">A channel that&apos;s off isn&apos;t synced and gets no feed link. Its saved calendar links stay.</p>
            </div>
            <ul className="divide-y divide-hairline rounded-md border border-hairline bg-white">
              {channels.map((channel) => (
                <ChannelItem key={channel.key} channel={channel} update={actions.updateChannel} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
