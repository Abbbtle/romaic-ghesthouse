import "server-only";
import { isRequestRef } from "@/lib/booking/reference-codes";
import { isIsoDate } from "@/lib/format/zoned-time";
import { signedTokens } from "./infrastructure";

/**
 * What the confirmation page shows after a request is sent: the reference,
 * the apartment, the dates and the group, carried in a signed token in the
 * page's address. Nothing personal goes in it (no name, phone or email), so
 * a shared or logged address leaks nothing; and it's signed, so nobody can
 * make the page show a request that was never sent. Nothing is looked up
 * by reference.
 */
export type BookingReceipt = { ref: string; apartment: string; arrive: string; leave: string; guests: number };

const receipts = () => signedTokens("booking-receipt");

export function signReceipt(receipt: BookingReceipt): string {
  return receipts().sign(JSON.stringify([receipt.ref, receipt.apartment, receipt.arrive, receipt.leave, receipt.guests]));
}

/** The receipt in `token`, if this server signed it; null for anything else. */
export function readReceipt(token: unknown): BookingReceipt | null {
  if (typeof token !== "string" || token.length > 400) return null;
  const payload = receipts().verify(token);
  if (payload === null) return null;
  try {
    const parsed: unknown = JSON.parse(payload);
    if (!Array.isArray(parsed) || parsed.length !== 5) return null;
    const [ref, apartment, arrive, leave, guests] = parsed as unknown[];
    if (!isRequestRef(ref) || typeof apartment !== "string" || !isIsoDate(arrive) || !isIsoDate(leave) || typeof guests !== "number") return null;
    return { ref, apartment, arrive, leave, guests };
  } catch {
    return null;
  }
}
