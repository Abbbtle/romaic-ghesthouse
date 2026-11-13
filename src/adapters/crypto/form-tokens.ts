import "server-only";
import type { FormTokens } from "@/lib/booking/ports";
import type { TokenSigner } from "./hmac";

/** Epoch milliseconds, as the token's payload carries them: digits only, nothing personal. */
const issuedAtPattern = /^\d{1,15}$/;

/**
 * The booking form's signed "shown at" times (the booking core's FormTokens
 * port). The payload is the time in milliseconds since 1970, signed with a
 * signer made for the form's own purpose ("booking-form"; see
 * createTokenSigner), so a token signed for anything else never passes. How
 * old a token may be is the core's rule (src/lib/booking/spam-rules.ts),
 * not this adapter's.
 */
export function createFormTokens(signer: TokenSigner): FormTokens {
  return {
    sign: (issuedAt) => signer.sign(String(issuedAt.getTime())),
    verify(token) {
      const payload = signer.verify(token);
      if (payload === null || !issuedAtPattern.test(payload)) return null;
      const issuedAt = new Date(Number(payload));
      return Number.isNaN(issuedAt.getTime()) ? null : issuedAt;
    },
  };
}
