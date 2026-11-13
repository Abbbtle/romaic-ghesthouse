import type { Metadata } from "next";
import { adminRoutes } from "@/components/admin/admin-routes";
import { ChannelsScreen, type AttentionRow, type CalendarRow, type ChannelRow, type UnitChannelsRow } from "@/components/admin/channels/channels-screen";
import { capitalised, whenLabel } from "@/components/admin/when-label";
import { can } from "@/lib/accounts/access";
import type { CalendarView } from "@/lib/channels/channel-service";
import { businessTimeZone } from "@/lib/format/zoned-time";
import { stayLabel } from "@/lib/inventory/stays";
import { requireDashboardActor } from "@/server/admin-session";
import { channelService, feedUrl } from "@/server/channels";
import { clock } from "@/server/infrastructure";
import { addCalendar, changeCalendarUrl, removeCalendar, resetFeed, syncAll, syncCalendar, updateChannel } from "./actions";

export const metadata: Metadata = { title: "Channels" };

/** A calendar's state in a few words, for its pill, and what its last run did. */
function calendarStatus(calendar: CalendarView, now: Date): Pick<CalendarRow, "status" | "lastSynced" | "lastRun"> {
  const lastSynced = calendar.lastSyncedAt ? capitalised(whenLabel(calendar.lastSyncedAt, now, businessTimeZone)) : "Never";
  const run = calendar.lastRun;
  const lastRun =
    run && run.outcome === "ok"
      ? [`${run.added} new`, `${run.changed} changed`, `${run.removed} gone`, run.conflicts > 0 ? `${run.conflicts} double booked` : null].filter(Boolean).join(" · ")
      : run?.outcome === "not-modified"
        ? "No changes since the last sync"
        : null;
  const status: CalendarRow["status"] =
    calendar.lastStatus === "never" ? { label: "Not synced yet", tone: "neutral" } : calendar.lastStatus === "ok" ? { label: "Synced", tone: "success" } : { label: "Couldn't sync", tone: "danger" };
  return { status, lastSynced, lastRun };
}

/**
 * Channels and two-way iCal (/admin/channels). Owner, admin and sales see
 * the imported calendars, conflicts and "Sync now" (channels:status); only
 * the owner and admin change calendar links, switch channels and see or
 * reset the feed links (channels:configure). Never staff. A calendar link,
 * once saved, is never sent to the browser again: only its host.
 */
export default async function ChannelsPage() {
  const actor = await requireDashboardActor({ permission: "channels:status" });
  const service = channelService();
  const canConfigure = can(actor, "channels:configure");
  const [overview, feeds] = await Promise.all([service.overview(actor), canConfigure ? service.feeds(actor) : Promise.resolve(null)]);
  const now = clock.now();
  const activeChannels = overview.channels.filter((channel) => channel.active);

  const channels: ChannelRow[] = overview.channels.map((channel) => ({ key: channel.key, name: channel.name, active: channel.active }));
  const units: UnitChannelsRow[] = overview.units.map((unit) => {
    const feed = feeds?.find((candidate) => candidate.unitId === unit.id);
    const calendars = overview.calendars.filter((calendar) => calendar.unitId === unit.id);
    return {
      id: unit.id,
      name: unit.name,
      calendars: calendars.map((calendar) => ({
        id: calendar.id,
        channelName: calendar.channelName,
        channelActive: activeChannels.some((channel) => channel.key === calendar.channel),
        host: calendar.host,
        lastError: calendar.lastError,
        ...calendarStatus(calendar, now),
      })),
      availableChannels: activeChannels
        .filter((channel) => !calendars.some((calendar) => calendar.channel === channel.key))
        .map((channel) => ({ value: channel.key, label: channel.name })),
      feed: !feed
        ? undefined
        : feed.token
          ? {
              links: activeChannels.map((channel) => ({ channelName: channel.name, url: feedUrl(feed.token!, channel.key) })),
              made: feed.createdAt ? capitalised(whenLabel(feed.createdAt, now, businessTimeZone)) : null,
            }
          : null,
    };
  });
  const attention: AttentionRow[] = overview.attention.map((event) => ({
    id: event.id,
    unitName: event.unitName,
    channelName: event.channelName,
    stay: stayLabel(event.stay),
    kind: event.status === "conflict" ? "conflict" : event.status === "gone" ? "gone" : "changed",
    note: event.note,
    // Admin (Weberu) sees the channels but never bookings: these links are for the owner and sales.
    bookHref: event.status === "conflict" && event.bookingId === null && can(actor, "bookings:create") ? `${adminRoutes.bookings}/new?channelStay=${event.id}` : null,
    bookingHref: event.bookingId && can(actor, "bookings:view") ? `${adminRoutes.bookings}/${event.bookingId}` : null,
  }));

  return (
    <ChannelsScreen
      attention={attention}
      units={units}
      channels={channels}
      canConfigure={canConfigure}
      calendarCount={overview.calendars.length}
      actions={{ syncCalendar, syncAll, addCalendar, changeCalendarUrl, removeCalendar, resetFeed, updateChannel }}
    />
  );
}
