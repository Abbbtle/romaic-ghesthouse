import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { adminRoutes } from "@/components/admin/admin-routes";
import { bookingStatusNames } from "@/components/admin/bookings/booking-labels";
import { chartNights, chartRow, type ChartCell } from "@/components/admin/calendar/chart-rows";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { inputClasses } from "@/components/ui/form-controls";
import { can } from "@/lib/accounts/access";
import { addDays, daysBetween, isIsoDate, type IsoDate } from "@/lib/format/zoned-time";
import { stayLabel } from "@/lib/inventory/stays";
import { blockReasonNames, type AvailabilityBlock } from "@/lib/inventory/units";
import type { ChartView } from "@/lib/reservations/reservation-service";
import { requireDashboardActor } from "@/server/admin-session";
import { reservationService } from "@/server/stays";

export const metadata: Metadata = { title: "Calendar" };

/** Two weeks at a time: fits a laptop without scrolling, and scrolls sideways inside its frame on a phone. */
const nightsShown = 14;

/** How far either side of today the chart goes, so a typed date can't ask for a year of rows. */
const reachDays = 730;

const weekday = new Intl.DateTimeFormat("en-ZA", { weekday: "short", timeZone: "UTC" });
const monthName = new Intl.DateTimeFormat("en-ZA", { month: "short", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat("en-ZA", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const at = (night: IsoDate) => new Date(`${night}T00:00:00Z`);

type Tone = { treatment: string; label: string };

/**
 * Each state is a different treatment, not just a different hue, so they
 * tell apart without colour too: in the house is solid, booked is outlined,
 * a channel's stay has a dashed outline, closed nights are hatched, a stay
 * that's over is muted. Every text pairing passes 4.5:1 (design-spec §2.4),
 * and each cell names its state in words as well.
 */
const tones = {
  inHouse: { treatment: "border border-success-700 bg-success-700 text-white", label: "In the house" },
  booked: { treatment: "border-2 border-navy-600 bg-white text-navy-900", label: "Booked" },
  channel: { treatment: "border-2 border-dashed border-info-700 bg-white text-info-800", label: "Channel booking" },
  // Written out whole (not built from parts) so Tailwind finds the classes.
  closed: {
    treatment: "border border-neutral-400 bg-[repeating-linear-gradient(135deg,var(--color-neutral-50)_0_6px,var(--color-neutral-100)_6px_12px)] text-neutral-800",
    label: "Closed by you",
  },
  maintenance: {
    treatment: "border border-warning-500 bg-[repeating-linear-gradient(135deg,var(--color-warning-50)_0_6px,var(--color-warning-100)_6px_12px)] text-warning-800",
    label: "Maintenance",
  },
  gone: { treatment: "border border-hairline bg-transparent text-fg-2", label: "Checked out" },
} satisfies Record<string, Tone>;

function toneOf(block: AvailabilityBlock, bookings: ChartView["bookings"]): Tone {
  if (block.reason === "booking") {
    const status = block.bookingId ? bookings[block.bookingId]?.status : undefined;
    return status === "checked-in" ? tones.inHouse : status === "checked-out" ? tones.gone : tones.booked;
  }
  if (block.reason === "channel") return tones.channel;
  if (block.reason === "maintenance") return tones.maintenance;
  return tones.closed;
}

function fromParam(value: string | string[] | undefined, today: IsoDate): IsoDate {
  if (typeof value !== "string" || !isIsoDate(value)) return today;
  return Math.abs(daysBetween(today, value)) > reachDays ? today : value;
}

/**
 * The availability chart for the owner and sales (Pattern: calendar): every
 * active unit by night for two weeks, with what holds each night: bookings,
 * channel stays, and nights closed for the owner or maintenance. A booking
 * opens on a tap.
 */
export default async function CalendarPage({ searchParams }: PageProps<"/admin/calendar">) {
  const actor = await requireDashboardActor({ permission: "availability:view" });
  const reservations = reservationService();
  const today = reservations.today();
  const from = fromParam((await searchParams).from, today);
  const view = await reservations.chart(actor, from, nightsShown);
  const nights = chartNights(view.from, view.until);
  const linkBookings = can(actor, "bookings:view");
  const linkChannelStays = can(actor, "bookings:create");
  const href = (date: IsoDate) => (date === today ? adminRoutes.calendar : `${adminRoutes.calendar}?from=${date}`);

  return (
    <>
      <PageHeader title="Calendar" description="Which units are taken, night by night." />
      {/* One minmax(0, 1fr) column, and a positioned frame (so the cells' screen-reader text is clipped by it too): the table scrolls inside its frame instead of widening the page. */}
      <div className="grid max-w-admin grid-cols-1 gap-5">
        <nav aria-label="Dates" className="flex flex-wrap items-end gap-x-3 gap-y-3">
          <div className="flex gap-2">
            <ButtonLink href={href(addDays(from, -7))} variant="secondary" size="sm" icon={<ChevronLeft aria-hidden="true" strokeWidth={2} className="size-4" />}>
              Week before
            </ButtonLink>
            <ButtonLink href={href(addDays(from, 7))} variant="secondary" size="sm" iconEnd={<ChevronRight aria-hidden="true" strokeWidth={2} className="size-4" />}>
              Week after
            </ButtonLink>
          </div>
          {from !== today && (
            <ButtonLink href={adminRoutes.calendar} variant="ghost" size="sm">
              Back to today
            </ButtonLink>
          )}
          <form action={adminRoutes.calendar} className="flex items-end gap-2 sm:ml-auto">
            <div>
              <label htmlFor="chart-from" className="block text-xs font-bold text-fg-2">
                Starting
              </label>
              <input id="chart-from" name="from" type="date" defaultValue={from} min={addDays(today, -reachDays)} max={addDays(today, reachDays)} className={inputClasses("compact", "mt-1")} />
            </div>
            <button type="submit" className="inline-flex min-h-11 items-center rounded-sm border-[1.5px] border-ink bg-white px-4 text-sm font-bold text-ink hover:bg-chalk">
              Show
            </button>
          </form>
        </nav>

        {view.units.length === 0 ? (
          <EmptyState
            title="No units yet"
            actions={
              can(actor, "rates:manage") ? (
                <ButtonLink href={adminRoutes.apartments} size="sm">
                  Add units
                </ButtonLink>
              ) : undefined
            }
          >
            The calendar shows each unit once it&apos;s been added under Apartments.
          </EmptyState>
        ) : (
          <div className="relative min-w-0 overflow-x-auto rounded-md border border-hairline bg-white" tabIndex={0} role="region" aria-label={`Units by night, ${stayLabel({ arrive: view.from, leave: view.until })}`}>
            {/* Fixed layout: every night the same width, whatever's written in it; the unit column plus 14 nights of 3rem sets the least width. */}
            <table className="w-full min-w-[47.5rem] table-fixed border-collapse text-sm sm:min-w-[54rem]">
              <caption className="sr-only">
                Each unit&apos;s nights from {longDate.format(at(view.from))} for {nightsShown} nights. Empty cells are free.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-10 w-[5.5rem] border-b border-hairline bg-white px-2 py-2 text-left text-xs font-bold text-fg-3 sm:w-48 sm:px-3">
                    Unit
                  </th>
                  {nights.map((night, index) => {
                    const isToday = night === today;
                    const day = Number(night.slice(8));
                    return (
                      <th
                        key={night}
                        scope="col"
                        aria-current={isToday ? "date" : undefined}
                        className={cx("border-b border-l border-hairline px-1 py-2 text-center font-medium tabular-nums", isToday ? "bg-neutral-100 text-ink shadow-[inset_0_3px_0_var(--color-gold-400)]" : "text-fg-2")}
                      >
                        <span className="sr-only">{longDate.format(at(night))}</span>
                        <span aria-hidden="true" className="grid leading-tight">
                          <span className="text-xs">{index === 0 || day === 1 ? monthName.format(at(night)) : weekday.format(at(night))}</span>
                          <span className={cx("text-base", isToday && "font-bold")}>{day}</span>
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {view.units.map((unit) => (
                  <tr key={unit.id}>
                    <th scope="row" className="sticky left-0 z-10 border-b border-hairline bg-white px-2 py-2 text-left align-middle sm:px-3">
                      <span className="block font-bold break-words text-ink">{unit.name}</span>
                      {/* On phones the unit's name is enough to scan by; screen readers still hear the apartment. */}
                      <span className="sr-only text-xs font-normal text-fg-3 sm:not-sr-only sm:block sm:truncate">{unit.apartmentName}</span>
                    </th>
                    {chartRow(unit.id, view.blocks, view.from, view.until).map((cell) => (
                      <ChartCellView key={cell.kind === "free" ? cell.night : cell.block.id} cell={cell} bookings={view.bookings} today={today} linkBookings={linkBookings} linkChannelStays={linkChannelStays} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <ul aria-label="What the cells mean" className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-fg-2">
          {Object.values(tones).map((tone) => (
            <li key={tone.label} className="flex items-center gap-2">
              <span aria-hidden="true" className={cx("h-4 w-6 rounded-xs", tone.treatment)} />
              {tone.label}
            </li>
          ))}
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="size-4 rounded-xs border border-hairline bg-white" />
            Free
          </li>
        </ul>
      </div>
    </>
  );
}

function ChartCellView({
  cell,
  bookings,
  today,
  linkBookings,
  linkChannelStays,
}: {
  cell: ChartCell;
  bookings: ChartView["bookings"];
  today: IsoDate;
  linkBookings: boolean;
  linkChannelStays: boolean;
}) {
  if (cell.kind === "free") {
    return (
      <td className={cx("h-16 border-b border-l border-hairline", cell.night === today && "bg-neutral-50")}>
        <span className="sr-only">Free</span>
      </td>
    );
  }
  const { block } = cell;
  const tone = toneOf(block, bookings);
  const booking = block.reason === "booking" && block.bookingId ? bookings[block.bookingId] : undefined;
  const label = booking?.guestName ?? blockReasonNames[block.reason];
  const details = [booking?.ref, stayLabel(block.stay), booking ? bookingStatusNames[booking.status] : null, !booking && block.note].filter(Boolean).join(", ");
  const body = (
    <>
      {/* Two lines when the stay is wide enough; a single night's narrow cell truncates rather than breaking a name mid-word. */}
      <span className={cx("leading-tight font-bold", cell.nights > 1 ? "line-clamp-2" : "truncate")}>
        {cell.startsBefore && <span aria-hidden="true">← </span>}
        {label}
      </span>
      {booking && (
        <span aria-hidden="true" className="mt-0.5 block truncate text-xs">
          {/* The state in words on phones, where the cells are narrow; the reference on wider screens. */}
          <span className="sm:hidden">{tone.label}</span>
          <span className="hidden font-mono sm:inline">{cell.nights > 1 ? booking.ref : tone.label}</span>
        </span>
      )}
      <span className="sr-only">: {details}</span>
    </>
  );
  const frame = cx("flex h-full min-h-14 flex-col justify-center rounded-xs px-1.5 py-1 text-left sm:px-2", tone.treatment, cell.startsBefore && "rounded-l-none", cell.endsAfter && "rounded-r-none");
  return (
    <td colSpan={cell.nights} className="h-16 border-b border-l border-hairline p-0.5">
      {booking && linkBookings && block.bookingId ? (
        <Link href={`${adminRoutes.bookings}/${block.bookingId}`} className={cx(frame, "hover:brightness-95")}>
          {body}
        </Link>
      ) : block.reason === "channel" && block.channelEventId && linkChannelStays ? (
        <Link href={`${adminRoutes.bookings}/new?channelStay=${block.channelEventId}`} className={cx(frame, "hover:brightness-95")}>
          {body}
          <span className="sr-only">. Make it a booking.</span>
        </Link>
      ) : (
        <div className={frame}>{body}</div>
      )}
    </td>
  );
}
