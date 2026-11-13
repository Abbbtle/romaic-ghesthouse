import { connection, type NextRequest } from "next/server";
import { channelService, feedChannel, feedResponse, feedTokenPattern } from "@/server/channels";

/**
 * A unit's export feed, which channels subscribe to: the nights it isn't
 * available, as all-day events with no names, notes or reasons. The token
 * is the secret (see src/server/channels.ts); `?channel=<key>` leaves out
 * the stays imported from that channel, so a channel never sees its own
 * bookings echoed back as blocks.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/calendar/[token]">): Promise<Response> {
  // Per request, never at build time: the nights change all the time.
  await connection();
  const { token } = await params;
  const ifNoneMatch = request.headers.get("if-none-match");
  if (!feedTokenPattern.test(token)) return feedResponse(null, ifNoneMatch);
  const ics = await channelService().feedIcs(token, feedChannel(request.nextUrl.searchParams.get("channel")));
  return feedResponse(ics, ifNoneMatch);
}
