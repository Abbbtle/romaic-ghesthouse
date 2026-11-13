import type { RandomSource } from "./ports";

/**
 * Reference codes for requests, such as "RG-7K2QX": short enough to read
 * out on WhatsApp, with no look-alike characters (no I, L, O, 0 or 1). They
 * are for conversation only; nothing can be looked up with one. 31^5 codes
 * (about 28.6 million) keep collisions rare, and the store refuses a code
 * that's already in use, so the service draws again.
 */

export const requestRefPrefix = "RG-";

export const requestRefAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const requestRefLength = 5;

const refPattern = new RegExp(`^${requestRefPrefix}[${requestRefAlphabet}]{${requestRefLength}}$`);

/** A new code, from `random`. */
export function newRequestRef(random: RandomSource): string {
  let code = "";
  for (let index = 0; index < requestRefLength; index += 1) {
    const pick = random.randomInt(requestRefAlphabet.length);
    if (!Number.isInteger(pick) || pick < 0 || pick >= requestRefAlphabet.length) {
      throw new RangeError(`The random source gave ${pick}, outside 0–${requestRefAlphabet.length - 1}.`);
    }
    code += requestRefAlphabet.charAt(pick);
  }
  return `${requestRefPrefix}${code}`;
}

export function isRequestRef(value: unknown): value is string {
  return typeof value === "string" && refPattern.test(value);
}
