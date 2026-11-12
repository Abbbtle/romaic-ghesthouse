import { addDays } from "@/lib/format/zoned-time";
import { writeIcs, type IcsEvent } from "./ics";
import type { FeedBlock } from "./ports";

/**
 * A unit's export feed: every night it isn't available, as all-day events
 * that say only "Not available". No guest names, notes, reasons or prices,
 * whatever holds the nights. When a channel asks for the feed for itself
 * (`forChannel`), the stays imported from that channel's own calendar are
 * left out, so a stay cancelled on the channel isn't sent back to it as
 * still blocked.
 */
export function unitFeedIcs({ blocks, forChannel }: { blocks: readonly FeedBlock[]; forChannel: string | null }): string {
  const events: IcsEvent[] = blocks
    .filter(({ channel }) => forChannel === null || channel !== forChannel)
    .map(({ block }) => ({
      uid: `${block.id}@romaic-guesthouse`,
      stamp: block.createdAt,
      time: { kind: "all-day", firstDay: block.stay.arrive, lastDay: addDays(block.stay.leave, -1) },
      summary: "Not available",
      location: null,
    }));
  return writeIcs({ productId: "-//Romaic Guesthouse//Availability//EN", name: "Romaic Guesthouse availability", refreshInterval: "PT1H", events });
}
