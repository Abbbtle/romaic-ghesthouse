"use client";

import { CalendarDays, Minus, Plus } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { buttonClasses } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { IconButton } from "@/components/ui/icon-button";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-12-12" → { day: "12", rest: "Sat · Dec" }, read as a calendar date (no time zone). */
function dateParts(iso: string): { day: string; rest: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return { day: String(d), rest: `${weekdays[date.getUTCDay()]} · ${months[m - 1]}` };
}

/** What's wrong with a range, once both days are in: a leaving day on or before the arrival day. */
function rangeProblem(arrive: string, leave: string): string | null {
  return arrive && leave && leave <= arrive ? "Pick a leaving day after the arrival day." : null;
}

function DateTile({
  label,
  value,
  min,
  invalid,
  describedBy,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  min?: string;
  invalid?: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
}) {
  const id = useId();
  const parts = dateParts(value);
  return (
    <div
      className={cx(
        "relative flex min-h-24 flex-col justify-between rounded-sm border bg-field px-4 pt-3 pb-3 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus",
        invalid ? "border-danger" : "border-control hover:border-control-hover focus-within:border-focus",
      )}
    >
      <label htmlFor={id} className="font-display text-sm font-semibold tracking-[0.14em] text-fg-3 uppercase">
        {label}
      </label>
      {parts ? (
        <span aria-hidden="true" className="flex items-baseline gap-2">
          <span className="font-display text-date font-semibold text-ink" data-numeric>
            {parts.day}
          </span>
          <span className="text-sm font-bold text-fg-2">{parts.rest}</span>
        </span>
      ) : (
        <span aria-hidden="true" className="flex items-center gap-2 text-base text-fg-3">
          <CalendarDays strokeWidth={1.5} className="size-5 text-gold-text" />
          Add date
        </span>
      )}
      {/* The native date input covers the tile, so tapping anywhere opens the phone's own date picker. */}
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.currentTarget.value)}
        onBlur={onBlur}
        onClick={(event) => event.currentTarget.showPicker?.()}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}

/**
 * The dates-and-guests search: the classic page's working action, in the
 * first viewport (the craft bar Grano Hotels sets; see
 * docs/planning/design-references.md). Large date numerals so a guest sees
 * their stay at a glance; the phone's own date picker; a guest stepper with
 * 44 px buttons named by tooltips. A leaving day before the arrival day is
 * flagged when the leaving tile loses focus, and the message clears as soon
 * as either day changes. The button always works: pressing it with a day
 * missing says what to add. Phase 2 points it at live availability; until
 * then `onSearch` decides what happens (the design preview explains it).
 */
export function DatesSearch({
  initialArrive = "",
  initialLeave = "",
  initialGuests = 2,
  maxGuests = 5,
  onSearch,
  className,
}: {
  initialArrive?: string;
  initialLeave?: string;
  initialGuests?: number;
  maxGuests?: number;
  onSearch?: (search: { arrive: string; leave: string; guests: number }) => void;
  className?: string;
}) {
  const [arrive, setArrive] = useState(initialArrive);
  const [leave, setLeave] = useState(initialLeave);
  const [guests, setGuests] = useState(initialGuests);
  const [problem, setProblem] = useState<string | null>(null);
  const guestsId = useId();
  const problemId = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!arrive || !leave) return setProblem("Add the day you arrive and the day you leave.");
    const range = rangeProblem(arrive, leave);
    if (range) return setProblem(range);
    setProblem(null);
    onSearch?.({ arrive, leave, guests });
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="Check dates"
      className={cx("grid gap-3 border border-hairline border-t-4 border-t-romaic-gold bg-white p-4 shadow-2 sm:p-5", className)}
    >
      <div className="grid grid-cols-2 gap-3">
        <DateTile
          label="Arrive"
          value={arrive}
          invalid={problem !== null && !arrive}
          describedBy={problem ? problemId : undefined}
          onChange={(value) => {
            setArrive(value);
            setProblem(null);
          }}
        />
        <DateTile
          label="Leave"
          value={leave}
          min={arrive || undefined}
          invalid={problem !== null && (!leave || rangeProblem(arrive, leave) !== null)}
          describedBy={problem ? problemId : undefined}
          onChange={(value) => {
            setLeave(value);
            setProblem(null);
          }}
          onBlur={() => setProblem(rangeProblem(arrive, leave))}
        />
      </div>
      <div className="flex items-center justify-between gap-4 rounded-sm border border-control px-4 py-1.5">
        <span id={guestsId} className="font-display text-sm font-semibold tracking-[0.14em] text-fg-3 uppercase">
          Guests
        </span>
        <div role="group" aria-labelledby={guestsId} className="flex items-center gap-1">
          <IconButton
            label="Fewer guests"
            icon={<Minus />}
            onClick={() => setGuests((count) => Math.max(1, count - 1))}
            disabled={guests <= 1}
            className="text-ink disabled:text-neutral-400"
          />
          <output aria-live="polite" className="w-14 text-center text-lg font-bold" data-numeric>
            {guests} <span className="sr-only">{guests === 1 ? "guest" : "guests"}</span>
          </output>
          <IconButton
            label="More guests"
            icon={<Plus />}
            onClick={() => setGuests((count) => Math.min(maxGuests, count + 1))}
            disabled={guests >= maxGuests}
            className="text-ink disabled:text-neutral-400"
          />
        </div>
      </div>
      {problem && (
        <p id={problemId} role="alert" className="text-sm font-bold text-danger-fg">
          {problem}
        </p>
      )}
      <button type="submit" className={buttonClasses({ variant: "primary", size: "lg", fullWidth: true })}>
        Show free apartments
      </button>
    </form>
  );
}
