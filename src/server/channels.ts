import "server-only";
import { randomSecrets, sha256Hex } from "@/adapters/crypto/tokens";
import { createIcalFetcher } from "@/adapters/http/ical-fetcher";
import { createPostgresChannelStore } from "@/adapters/postgres/channel-store";
import { createPostgresInventoryStore } from "@/adapters/postgres/inventory-store";
import { assertCan, can } from "@/lib/accounts/access";
import { createChannelService, type ChannelService } from "@/lib/channels/channel-service";
import { businessTimeZone } from "@/lib/format/zoned-time";
import { auditRecorder } from "./audit";
import { matchesIfNoneMatch } from "./conditional-get";
import { env } from "./env";
import { clock, database, fieldCipher, ids } from "./infrastructure";

/**
 * The channels core as the site uses it: channels, calendars and imported
 * stays in Postgres; calendar links fetched by the iCal adapter (only from
 * the channels' own domains); calendar links and feed tokens sealed with
 * DATA_ENCRYPTION_KEY; permissions from the accounts core; every change in
 * the audit log ("channels"), never with a link or token in it.
 */

let channels: ChannelService | null = null;

export function channelService(): ChannelService {
  channels ??= createChannelService({
    store: createPostgresChannelStore(database()),
    inventory: createPostgresInventoryStore(database()),
    manager: createIcalFetcher(),
    vault: {
      seal: (secret, context) => fieldCipher().encrypt(secret, context),
      open: (sealed, context) => fieldCipher().decrypt(sealed, context),
    },
    tokens: { newToken: randomSecrets.linkToken, hash: sha256Hex },
    clock,
    ids,
    audit: auditRecorder(),
    access: { can, assertCan },
    timeZone: businessTimeZone,
  });
  return channels;
}

/** Where a unit's export feed is, for the token in it; `channel` leaves out that channel's own stays (give each channel its own link). */
export function feedUrl(token: string, channel: string | null): string {
  const url = new URL(`/api/calendar/${encodeURIComponent(token)}`, env.siteUrl());
  if (channel) url.searchParams.set("channel", channel);
  return url.href;
}

/** A feed token as randomSecrets.linkToken makes them: 32 bytes, base64url. Anything else is never looked up. */
export const feedTokenPattern = /^[A-Za-z0-9_-]{43}$/;

/** A channel key as migration 250 allows them. */
const channelKeyPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The `channel` query of a feed link: a channel key, or null when there's none (or it isn't one). */
export function feedChannel(value: string | null): string | null {
  return value && value.length <= 32 && channelKeyPattern.test(value) ? value : null;
}

/**
 * The response for GET /api/calendar/<token>: the unit's busy nights as
 * iCalendar, or 404 for an unknown token. Channels poll it, so it's
 * labelled with an ETag (a 304 when unchanged) and may be kept privately
 * for five minutes; never by a shared cache, since the link is a secret.
 */
export function feedResponse(ics: string | null, ifNoneMatch: string | null): Response {
  const common = { "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
  if (ics === null) {
    return new Response("Not found", { status: 404, headers: { ...common, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  const etag = `"${sha256Hex(ics).slice(0, 32)}"`;
  const caching = { ...common, ETag: etag, "Cache-Control": "private, max-age=300" };
  if (matchesIfNoneMatch(ifNoneMatch, etag)) return new Response(null, { status: 304, headers: caching });
  return new Response(ics, {
    headers: { ...caching, "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="availability.ics"' },
  });
}

/** The daily job: imports every calendar of an active channel. One failing never stops the rest; each records its own result. */
export async function syncAllCalendars(): Promise<{ calendars: number; failed: number; added: number; conflicts: number }> {
  const summaries = await channelService().syncAll();
  return {
    calendars: summaries.length,
    failed: summaries.filter((summary) => summary.outcome === "error").length,
    added: summaries.reduce((total, summary) => total + summary.added, 0),
    conflicts: summaries.reduce((total, summary) => total + summary.conflicts, 0),
  };
}
