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

/** A date typed only partly, or one the calendar doesn't have. */
const incompleteDate = "That date isn't complete. Type the day, month and year, or choose it from the calendar.";

/** What's wrong with a range, once both days are in: a leaving day on or before the arrival day. */
function rangeProblem(arrive: string, leave: string): string | null {
  return arrive && leave && leave <= arrive ? "Pick a leaving day after the arrival day." : null;
}

function DateTile({
  label,
  name,
  value,
  min,
  invalid,
  describedBy,
  onChange,
  onBlur,
}: {
  label: string;
  name: string;
  value: string;
  min?: string;
  invalid?: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
  onBlur?: (incomplete: boolean) => void;
}) {
  const id = useId();
  const parts = dateParts(value);
  return (
    <div
      className={cx(
        "group relative flex min-h-24 flex-col justify-between rounded-sm border bg-field px-4 pt-3 pb-3 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus",
        invalid ? "border-danger" : "border-control hover:border-control-hover focus-within:border-focus",
      )}
    >
      <label htmlFor={id} className="font-display text-sm font-semibold tracking-[0.14em] text-fg-3 uppercase">
        {label}
      </label>
      {parts ? (
        <span aria-hidden="true" className="flex items-baseline gap-2 group-focus-within:invisible">
          <span className="font-display text-date font-semibold text-ink" data-numeric>
            {parts.day}
          </span>
          <span className="text-sm font-bold text-fg-2">{parts.rest}</span>
        </span>
      ) : (
        <span aria-hidden="true" className="flex items-center gap-2 text-base text-fg-3 group-focus-within:invisible">
          <CalendarDays strokeWidth={1.5} className="size-5 text-gold-text" />
          Add date
        </span>
      )}
      {/*
        The native date input covers the tile, so tapping anywhere opens the phone's own date picker. While it
        has focus it shows its own day, month and year in place of the large numerals, so a date typed from the
        keyboard can be seen as it's typed.
      */}
      <input
        id={id}
        type="date"
        name={name}
        value={value}
        min={min}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.currentTarget.value)}
        onBlur={(event) => onBlur?.(event.currentTarget.validity.badInput)}
        onClick={(event) => event.currentTarget.showPicker?.()}
        className="absolute inset-0 h-full w-full cursor-pointer bg-transparent px-4 pt-9 pb-3 text-lg font-bold text-ink opacity-0 focus:opacity-100"
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
 * missing says what to add.
 *
 * With `action` it's a plain GET form to the Book page (arrive, leave,
 * guests and, from a room's page, the room as `apartment`), so it works before
 * scripts load and the result has an address a guest can share; the Book
 * page checks it all again on the server. `onSearch` is for the design
 * preview, which handles the search itself.
 */
export function DatesSearch({
  initialArrive = "",
  initialLeave = "",
  initialGuests = 2,
  maxGuests = 12,
  today,
  action,
  apartment,
  initialProblem,
  submitLabel = "Show free rooms",
  label = "Check dates",
  onSearch,
  className,
}: {
  initialArrive?: string;
  initialLeave?: string;
  initialGuests?: number;
  maxGuests?: number;
  /** Today in Welkom, the earliest arrival day the picker offers. */
  today?: string;
  /** Where the search goes, as a GET form ("/book"). */
  action?: string;
  /** A room type to ask about (its link name), carried to the Book page. */
  apartment?: string;
  /** What the server found wrong with the last search, shown until either day changes. */
  initialProblem?: string;
  submitLabel?: string;
  /** The form's name for screen readers. */
  label?: string;
  onSearch?: (search: { arrive: string; leave: string; guests: number }) => void;
  className?: string;
}) {
  const [arrive, setArrive] = useState(initialArrive);
  const [leave, setLeave] = useState(initialLeave);
  const [guests, setGuests] = useState(Math.min(Math.max(1, initialGuests), maxGuests));
  const [problem, setProblem] = useState<string | null>(initialProblem ?? null);
  const guestsId = useId();
  const problemId = useId();

  const submit = (event: FormEvent) => {
    const refuse = (message: string) => {
      event.preventDefault();
      setProblem(message);
    };
    if (!arrive || !leave) return refuse("Add the day you arrive and the day you leave.");
    const range = rangeProblem(arrive, leave);
    if (range) return refuse(range);
    setProblem(null);
    if (onSearch || !action) {
      event.preventDefault();
      onSearch?.({ arrive, leave, guests });
    }
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      action={action}
      method={action ? "get" : undefined}
      aria-label={label}
      className={cx("grid gap-3 border border-hairline border-t-4 border-t-romaic-gold bg-white p-4 shadow-2 sm:p-5", className)}
    >
      <div className="grid grid-cols-2 gap-3">
        <DateTile
          label="Arrive"
          name="arrive"
          value={arrive}
          min={today}
          invalid={problem !== null && !arrive}
          describedBy={problem ? problemId : undefined}
          onChange={(value) => {
            setArrive(value);
            setProblem(null);
          }}
          onBlur={(incomplete) => incomplete && setProblem(incompleteDate)}
        />
        <DateTile
          label="Leave"
          name="leave"
          value={leave}
          min={arrive || today}
          invalid={problem !== null && (!leave || rangeProblem(arrive, leave) !== null)}
          describedBy={problem ? problemId : undefined}
          onChange={(value) => {
            setLeave(value);
            setProblem(null);
          }}
          onBlur={(incomplete) => setProblem(incomplete ? incompleteDate : rangeProblem(arrive, leave))}
        />
      </div>
      {apartment && <input type="hidden" name="apartment" value={apartment} />}
      <input type="hidden" name="guests" value={guests} />
      <div className="flex items-center justify-between gap-4 rounded-sm border border-control px-4 py-1.5">
        <span id={guestsId} className="font-display text-sm font-semibold tracking-[0.14em] text-fg-3 uppercase">
          Guests
        </span>
        <div role="group" aria-labelledby={guestsId} className="flex items-center gap-1">
          <IconButton
            label="Fewer guests"
            icon={<Minus />}
            onClick={() => setGuests((count) => Math.max(1, count - 1))}
            aria-disabled={guests <= 1 || undefined}
            className="text-ink aria-disabled:text-neutral-400"
          />
          <output aria-live="polite" className="w-14 text-center text-lg font-bold" data-numeric>
            {guests} <span className="sr-only">{guests === 1 ? "guest" : "guests"}</span>
          </output>
          <IconButton
            label="More guests"
            icon={<Plus />}
            onClick={() => setGuests((count) => Math.min(maxGuests, count + 1))}
            aria-disabled={guests >= maxGuests || undefined}
            className="text-ink aria-disabled:text-neutral-400"
          />
        </div>
      </div>
      {problem && (
        <p id={problemId} role="alert" className="text-sm font-bold text-danger-fg">
          {problem}
        </p>
      )}
      <button type="submit" className={buttonClasses({ variant: "primary", size: "lg", fullWidth: true })}>
        {submitLabel}
      </button>
    </form>
  );
}
