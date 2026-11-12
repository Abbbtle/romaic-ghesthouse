import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isAllowedCalendarHost } from "@/lib/channels/channels";
import type { ChannelManager, FetchedCalendar } from "@/lib/channels/ports";

/**
 * The iCal ChannelManager: fetches a channel's calendar link, carefully,
 * since the link was typed into the dashboard and the server makes the
 * request:
 *
 * - https only, on the standard port, to a channel's own domain (or a
 *   subdomain: see isAllowedCalendarHost), and never to an IP address;
 * - the host's addresses are looked up first, and a private, loopback or
 *   link-local one is refused (the allow-list already rules out names an
 *   attacker controls; this guards against a channel's DNS pointing inward);
 * - at most 3 redirects, each checked the same way before it's followed;
 * - 10 seconds for the whole fetch and at most 1 MB of calendar;
 * - conditional (If-None-Match, If-Modified-Since), so an unchanged calendar
 *   costs a 304;
 * - a body that isn't a calendar (a login page, an error page) is a failure,
 *   never "no stays", which would remove every imported stay.
 *
 * Failure reasons are plain words for the dashboard and never repeat the URL.
 */

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** The addresses a host name resolves to. */
export type HostResolver = (host: string) => Promise<string[]>;

export type IcalFetcherOptions = {
  fetch?: FetchLike;
  /** Looks up a host's addresses before each request; null skips the check (tests with a fake fetch). */
  resolve?: HostResolver | null;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
};

export const icalFetchLimits = { timeoutMs: 10_000, maxBytes: 1_000_000, maxRedirects: 3 } as const;

/** What the database keeps of a validator (migration 250's checks); a longer one isn't kept. */
const validatorLimits = { etag: 200, lastModified: 100 } as const;

const userAgent = "RomaicGuesthouse-CalendarSync/1.0";

const reasons = {
  refused: "That link isn't a channel calendar link we can read. Paste the calendar link exactly as the channel gives it.",
  privateAddress: "That link points somewhere we won't fetch from. Paste the calendar link exactly as the channel gives it.",
  tooManyRedirects: "The channel sent us round too many redirects. Try again later, or paste the calendar link again.",
  timeout: "The channel took too long to answer. It will be tried again at the next sync.",
  unreachable: "The channel's calendar couldn't be reached. It will be tried again at the next sync.",
  tooLarge: "The channel's calendar is larger than we can read (over 1 MB).",
  notCalendar: "That link didn't give us a calendar (perhaps a sign-in or error page). Paste the calendar link from the channel again.",
  gone: "The channel says that calendar link doesn't work any more (it may have been reset). Paste the channel's current calendar link.",
  slowDown: "The channel asked us to slow down. It will be tried again at the next sync.",
} as const;

const statusReason = (status: number): string => {
  if (status === 401 || status === 403 || status === 404 || status === 410) return reasons.gone;
  if (status === 429) return reasons.slowDown;
  if (status >= 500) return `The channel's calendar had a problem on its side (error ${status}). It will be tried again at the next sync.`;
  return `The channel answered in a way we didn't expect (status ${status}). It will be tried again at the next sync.`;
};

const failed = (reason: string): FetchedCalendar => ({ status: "failed", reason });

/** Whether an IP address is one a server on the internet would never be at: private, loopback, link-local, shared, multicast or reserved. */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a = 0, b = 0, c = 0] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (version === 6) {
    const groups = ipv6Groups(address);
    if (!groups) return true;
    const [first = 0, second = 0] = groups;
    const embedded = (high: number, low: number) => `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
    // ::, ::1, and IPv4-compatible (::a.b.c.d) addresses.
    if (groups.slice(0, 6).every((group) => group === 0)) return groups[6] === 0 && groups[7]! <= 1 ? true : isPrivateAddress(embedded(groups[6]!, groups[7]!));
    // IPv4-mapped (::ffff:a.b.c.d, written either way) and NAT64 (64:ff9b::a.b.c.d) carry an IPv4 address in the last 32 bits.
    if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) return isPrivateAddress(embedded(groups[6]!, groups[7]!));
    if (first === 0x64 && second === 0xff9b) return isPrivateAddress(embedded(groups[6]!, groups[7]!));
    // 6to4 (2002:a.b.c.d::/48) carries it in bits 16–48; Teredo (2001:0::/32) hides one, so refuse it outright.
    if (first === 0x2002) return isPrivateAddress(embedded(second, groups[2]!));
    if (first === 0x2001 && second === 0) return true;
    return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xffc0) === 0xfec0 || (first & 0xff00) === 0xff00;
  }
  return true;
}

/** An IPv6 address as its eight 16-bit groups (with "::" and a trailing dotted IPv4 part expanded), or null when it doesn't read as one. */
function ipv6Groups(address: string): number[] | null {
  let text = address.toLowerCase().split("%")[0]!;
  const dotted = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number) as [number, number, number, number];
    text = `${text.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail].map((group) => Number.parseInt(group, 16));
  return groups.length === 8 && groups.every((group) => Number.isInteger(group) && group >= 0 && group <= 0xffff) ? groups : null;
}

const systemResolver: HostResolver = async (host) => (await lookup(host, { all: true, verbatim: true })).map((entry) => entry.address);

/** Whether `url` may be fetched: the same rules as the dashboard's (calendarUrlProblem), checked again at each hop. */
function allowedUrl(url: URL): boolean {
  return url.protocol === "https:" && !url.username && !url.password && (url.port === "" || url.port === "443") && isAllowedCalendarHost(url.hostname);
}

const keptValidator = (value: string | null, limit: number) => (value && value.length <= limit ? value : null);

async function readCapped(response: Response, maxBytes: number): Promise<string | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    return null;
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(bytes);
}

export function createIcalFetcher(options: IcalFetcherOptions = {}): ChannelManager {
  const fetchUrl: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  const resolve = options.resolve === undefined ? systemResolver : options.resolve;
  const timeoutMs = options.timeoutMs ?? icalFetchLimits.timeoutMs;
  const maxBytes = options.maxBytes ?? icalFetchLimits.maxBytes;
  const maxRedirects = options.maxRedirects ?? icalFetchLimits.maxRedirects;

  async function resolvesPublicly(host: string): Promise<boolean> {
    if (!resolve) return true;
    const addresses = await resolve(host);
    return addresses.length > 0 && addresses.every((address) => !isPrivateAddress(address));
  }

  async function fetchWithin(signal: AbortSignal, start: string, conditions: { etag: string | null; lastModified: string | null }): Promise<FetchedCalendar> {
    let current: URL;
    try {
      current = new URL(start);
    } catch {
      return failed(reasons.refused);
    }
    const headers: Record<string, string> = { accept: "text/calendar, text/plain;q=0.8, */*;q=0.1", "user-agent": userAgent };
    if (conditions.etag) headers["if-none-match"] = conditions.etag;
    if (conditions.lastModified) headers["if-modified-since"] = conditions.lastModified;

    for (let hop = 0; ; hop += 1) {
      if (!allowedUrl(current)) return failed(reasons.refused);
      let resolvedPublicly: boolean;
      try {
        resolvedPublicly = await resolvesPublicly(current.hostname);
      } catch {
        return failed(reasons.unreachable);
      }
      if (!resolvedPublicly) return failed(reasons.privateAddress);

      const response = await fetchUrl(current.href, { method: "GET", headers, redirect: "manual", signal, cache: "no-store" });
      if (response.status >= 300 && response.status < 400 && response.status !== 304) {
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location) return failed(statusReason(response.status));
        if (hop >= maxRedirects) return failed(reasons.tooManyRedirects);
        try {
          current = new URL(location, current);
        } catch {
          return failed(reasons.refused);
        }
        continue;
      }
      if (response.status === 304) {
        await response.body?.cancel();
        return { status: "not-modified" };
      }
      if (response.status !== 200) {
        await response.body?.cancel();
        return failed(statusReason(response.status));
      }
      const text = await readCapped(response, maxBytes);
      if (text === null) return failed(reasons.tooLarge);
      if (!/BEGIN:VCALENDAR/i.test(text)) return failed(reasons.notCalendar);
      return {
        status: "fetched",
        text,
        etag: keptValidator(response.headers.get("etag"), validatorLimits.etag),
        lastModified: keptValidator(response.headers.get("last-modified"), validatorLimits.lastModified),
      };
    }
  }

  return {
    async fetchCalendar(url, conditions) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetchWithin(controller.signal, url, conditions);
      } catch {
        // Never the error itself: a fetch error can quote the URL, and the URL is a secret.
        return failed(controller.signal.aborted ? reasons.timeout : reasons.unreachable);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
