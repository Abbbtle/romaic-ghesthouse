import { Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import { adminRoutes } from "@/components/admin/admin-routes";
import { bookingStatusNames, bookingStatusTones, sourceName } from "@/components/admin/bookings/booking-labels";
import { EmptyState } from "@/components/admin/empty-state";
import { List, ListRow } from "@/components/admin/list";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { StatusPill } from "@/components/admin/status-pill";
import { Tabs } from "@/components/admin/tabs";
import { ButtonLink } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/form-controls";
import { can } from "@/lib/accounts/access";
import { formatCents } from "@/lib/format/money";
import { addDays } from "@/lib/format/zoned-time";
import { stayLabelInList } from "@/lib/inventory/stays";
import { holdsNights, type BookingWithGuest } from "@/lib/reservations/reservations";
import { requireDashboardActor } from "@/server/admin-session";
import { allUnits, reservationService } from "@/server/stays";

export const metadata: Metadata = { title: "Bookings" };

const hrefs = { upcoming: adminRoutes.bookings, recent: `${adminRoutes.bookings}?list=recent` } as const;

/**
 * Bookings for the owner and sales (Pattern: list): the stays from today for
 * the next two months, the last month's, or a search by guest, phone, email
 * or reference. Each row opens the booking.
 */
export default async function BookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  const actor = await requireDashboardActor({ permission: "bookings:view" });
  const { q, list: asked } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const list = asked === "recent" ? "recent" : "upcoming";
  const reservations = reservationService();
  const today = reservations.today();
  const [bookings, units, toBook] = await Promise.all([
    query
      ? reservations.search(actor, query)
      : list === "recent"
        ? reservations.list(actor, { arrive: addDays(today, -31), leave: today })
        : reservations.list(actor, { arrive: today, leave: addDays(today, 62) }),
    allUnits(),
    !query && list === "upcoming" && can(actor, "bookings:create") ? reservations.channelStaysToBook(actor) : Promise.resolve([]),
  ]);
  const unitNames = new Map(units.map((unit) => [unit.id, unit.name]));
  const shown = query ? bookings : bookings.filter((booking) => holdsNights(booking.status));
  return (
    <>
      <PageHeader
        title="Bookings"
        description="Every stay, from the website, the phone, walk-ins and the channels."
        actions={
          can(actor, "bookings:create") ? (
            <ButtonLink href={`${adminRoutes.bookings}/new`} size="sm" icon={<Plus aria-hidden="true" strokeWidth={2} className="size-4" />}>
              New booking
            </ButtonLink>
          ) : undefined
        }
      />
      <div className="grid max-w-admin gap-5">
        <form role="search" action={adminRoutes.bookings} className="flex gap-2">
          <label htmlFor="booking-search" className="sr-only">
            Search bookings
          </label>
          <input id="booking-search" name="q" type="search" defaultValue={query} placeholder="Name, phone or reference" className={inputClasses("compact", "flex-1")} />
          <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-sm border-[1.5px] border-ink bg-white px-4 text-sm font-bold text-ink hover:bg-chalk">
            <Search aria-hidden="true" strokeWidth={2} className="size-4" />
            Search
          </button>
        </form>
        {!query && (
          <Tabs
            label="Bookings"
            current={hrefs[list]}
            items={[
              { href: hrefs.upcoming, label: "Next two months" },
              { href: hrefs.recent, label: "Last month" },
            ]}
          />
        )}
        {toBook.length > 0 && (
          <Panel title={`From channels' calendars (${toBook.length})`} description="Dates only. Add the guest and the price from the channel to make each one a booking." flush>
            <List>
              {toBook.map((stay) => (
                <ListRow
                  key={stay.id}
                  href={`${adminRoutes.bookings}/new?channelStay=${stay.id}`}
                  trailing={stay.status === "conflict" ? <StatusPill tone="danger">Double booking</StatusPill> : <StatusPill>To complete</StatusPill>}
                >
                  <span className="grid gap-0.5">
                    <span className="font-bold text-ink">
                      {sourceName(stay.channel)} <span className="font-normal text-fg-2">· {unitNames.get(stay.unitId) ?? "A unit"}</span>
                    </span>
                    <span className="text-sm text-fg-2">{stayLabelInList(stay.stay, today)}</span>
                  </span>
                </ListRow>
              ))}
            </List>
          </Panel>
        )}
        {shown.length > 0 ? (
          <Panel title={query ? `Bookings matching "${query}"` : list === "recent" ? "The last month" : "From today"} flush>
            <List>
              {shown.map((booking) => (
                <BookingRow key={booking.id} booking={booking} unitName={unitNames.get(booking.unitId) ?? "A unit"} today={today} />
              ))}
            </List>
          </Panel>
        ) : (
          <EmptyState title={query ? "No bookings match" : "No bookings here yet"}>
            {query
              ? "Try part of the guest's name, their phone number, email or the booking's reference."
              : "Accepted requests, and bookings you add for phone calls, walk-ins and channels, appear here."}
          </EmptyState>
        )}
      </div>
    </>
  );
}

/** A booking in the list, in fixed lines so a phone reads it the same each time: who and where (with the status), when, then where it came from and the price. */
function BookingRow({ booking, unitName, today }: { booking: BookingWithGuest; unitName: string; today: string }) {
  return (
    <ListRow href={`${adminRoutes.bookings}/${booking.id}`}>
      <span className="grid gap-0.5">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0 font-bold text-ink">
            {booking.guest.name} <span className="font-normal text-fg-2">· {unitName}</span>
          </span>
          <StatusPill tone={bookingStatusTones[booking.status]}>{bookingStatusNames[booking.status]}</StatusPill>
        </span>
        <span className="text-sm text-fg-2">{stayLabelInList(booking.stay, today)}</span>
        <span className="flex justify-between gap-3 text-sm text-fg-2">
          <span>{sourceName(booking.channel)}</span>
          <span className="tabular-nums" data-numeric>
            {formatCents(booking.totalCents)}
          </span>
        </span>
      </span>
    </ListRow>
  );
}
