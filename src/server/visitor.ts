import "server-only";
import { headers } from "next/headers";
import { env } from "./env";
import { visitorKeys } from "./infrastructure";

/**
 * The visitor's IP address from the header that carries it (CLIENT_IP_HEADER,
 * default x-forwarded-for): the last address in it, the one added by the
 * proxy closest to this server. On Vercel the header holds just the client's
 * address. Behind two proxies of your own, the last address is your first
 * proxy's, so every visitor would share one limit: name the header your edge
 * proxy fills in (such as x-real-ip) instead. With nothing in front of the
 * server (`next start` reachable directly), the header is whatever the
 * visitor sent, since Next.js only fills it in when it's missing: run behind
 * a proxy, or name a header only your host sets.
 */
export function clientAddress(headerValue: string | null): string | null {
  const addresses = (headerValue ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  return addresses.at(-1) ?? null;
}

/**
 * The part of an address a rate limit counts: an IPv4 address as it is, and
 * an IPv6 address by its /64 network, since one household or phone gets a
 * whole /64 and can step through it freely. An IPv4 address written as IPv6
 * (::ffff:1.2.3.4) counts as the IPv4 one. Anything unreadable is kept as
 * it came.
 */
export function rateLimitAddress(address: string | null): string | null {
  if (!address || !address.includes(":")) return address;
  const plain = address.replace(/^\[|\]$/g, "").split("%")[0]!.toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(plain);
  if (mapped) return mapped[1]!;
  const halves = plain.split("::");
  if (halves.length > 2) return address;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return address;
  const groups = [...head, ...Array.from({ length: missing }, () => "0"), ...tail];
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) return address;
  return `${groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

let warnedAboutMissingAddress = false;

/**
 * The rate-limit key for the visitor making this request: a keyed hash of
 * their IP address, so neither the address nor anything that leads back to
 * it is stored. Call it from a server action or route handler.
 */
export async function currentVisitorKey(): Promise<string> {
  const header = env.clientIpHeader();
  const address = clientAddress((await headers()).get(header));
  if (!address && !warnedAboutMissingAddress) {
    warnedAboutMissingAddress = true;
    console.warn(`[romaic] A request had no ${header} header, so visitors without one share a rate limit. Check CLIENT_IP_HEADER.`);
  }
  return visitorKeys().keyFor(rateLimitAddress(address));
}
