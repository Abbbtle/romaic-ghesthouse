import type { Metadata } from "next";
import { adminRoutes } from "@/components/admin/admin-routes";
import { sourceName } from "@/components/admin/bookings/booking-labels";
import { NewBookingForm, type ChannelStayPrefill } from "@/components/admin/bookings/new-booking-form";
import { stayLabel } from "@/lib/inventory/stays";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { requireDashboardActor } from "@/server/admin-session";
import { getSiteContent } from "@/server/site-content";
import { allUnits, reservationService } from "@/server/stays";
import { createBooking, quoteBooking } from "../actions";

export const metadata: Metadata = { title: "New booking" };

/** A booking taken by phone, at the gate or typed in from a channel (bookings:create: owner and sales). */
export default async function NewBookingPage({ searchParams }: PageProps<"/admin/bookings/new">) {
  const actor = await requireDashboardActor({ permission: "bookings:create" });
  const { guest: guestId, channelStay: channelStayId } = await searchParams;
  const reservations = reservationService();
  const [units, { apartments }, guestRecord, channelStay] = await Promise.all([
    allUnits(),
    getSiteContent(),
    typeof guestId === "string" ? reservations.guest(actor, guestId).catch(() => null) : Promise.resolve(null),
    typeof channelStayId === "string" ? reservations.channelStay(actor, channelStayId) : Promise.resolve(null),
  ]);
  const stayUnit = channelStay ? units.find((unit) => unit.id === channelStay.unitId) : undefined;
  const fromChannel: ChannelStayPrefill | null = channelStay
    ? {
        id: channelStay.id,
        unitId: channelStay.unitId,
        arrive: channelStay.stay.arrive,
        leave: channelStay.stay.leave,
        channel: channelStay.channel,
        channelName: sourceName(channelStay.channel),
        summary: `${stayLabel(channelStay.stay)}${stayUnit ? ` in ${stayUnit.name}` : ""}${channelStay.status === "conflict" ? ", which is already taken there, so choose another unit" : ""}`,
      }
    : null;
  const names = new Map(apartments.items.map((item) => [item.slug, item.name]));
  const options = units
    .filter((unit) => unit.active && names.has(unit.apartment))
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
    .map((unit) => ({ value: unit.id, label: `${unit.name} (${names.get(unit.apartment)})` }));
  return (
    <>
      <PageHeader title="New booking" description="For a phone call, a walk-in, or a booking made on a channel." back={{ href: adminRoutes.bookings, label: "Bookings" }} />
      {typeof channelStayId === "string" && !channelStay && (
        <p role="status" className="mb-4 max-w-form rounded-sm border border-hairline bg-surface-2 p-3 text-sm text-fg">
          That channel stay was already made into a booking, or it&apos;s gone from the channel. You can still make a booking by hand below.
        </p>
      )}
      <div className="max-w-form">
        {options.length > 0 ? (
          <NewBookingForm
            action={createBooking}
            quote={quoteBooking}
            units={options}
            guest={guestRecord ? { id: guestRecord.guest.id, name: guestRecord.guest.name } : null}
            fromChannel={fromChannel}
            today={reservations.today()}
          />
        ) : (
          <EmptyState title="Add units first">
            Bookings are for a unit. Add the real rooms behind each room type on the{" "}
            <a href={adminRoutes.apartments} className="font-bold underline underline-offset-4">
              Rooms
            </a>{" "}
            page.
          </EmptyState>
        )}
      </div>
    </>
  );
}
