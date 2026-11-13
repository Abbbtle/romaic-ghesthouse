import type { BookingTermsSection } from "@/lib/content/schema";

/**
 * Direct-booking terms: none are known yet (open question #12). Each stays
 * empty until the owner sets it, and the Policies page says it's still to
 * be confirmed instead of guessing. Only the owner can change these.
 */
export const bookingTermsDefaults: BookingTermsSection = {
  deposit: "",
  balance: "",
  cancellation: "",
  payment: "",
};
