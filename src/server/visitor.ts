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
  return visitorKeys().keyFor(address);
}
