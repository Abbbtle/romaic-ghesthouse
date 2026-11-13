import { z } from "zod";
import { randAmount, requiredText } from "@/lib/forms/fields";
import { isIsoDate } from "@/lib/format/zoned-time";

/**
 * What the dashboard's rate forms send, and how it's read. The service reads
 * every field again, whatever the browser checked.
 */

export const rateLimits = {
  /** R1,000,000 a night: more than any night here could cost, so a typo of extra zeros is caught. */
  maxCents: 100_000_000,
  maxGuests: 12,
  maxMinNights: 30,
  seasonNameMax: 60,
  /** How long one season may run. */
  maxSeasonNights: 400,
} as const;

const maxCheck = (noun: string) => ({ cents: rateLimits.maxCents, message: `Check ${noun}: it's more than R1,000,000.` });

const count = (min: number, max: number, message: string) => z.coerce.number(message).int(message).min(min, message).max(max, message);

/** A checkbox or switch: posted as "on" when it's ticked. */
const ticked = z.preprocess((value) => value === "on" || value === true || value === "true", z.boolean());

export const ratePlanSchema = z
  .object({
    nightly: randAmount({ required: "Enter the price of a night.", invalid: "Enter the price in rand, like 850 or 850.50.", max: maxCheck("the nightly price") }),
    baseGuests: count(1, rateLimits.maxGuests, `Enter how many guests the nightly price is for, 1 to ${rateLimits.maxGuests}.`),
    extraGuest: randAmount({
      required: "Enter the charge per extra guest, or 0.",
      invalid: "Enter the charge in rand, like 150, or 0.",
      max: maxCheck("the extra guest charge"),
    }),
    minNights: count(1, rateLimits.maxMinNights, `Enter the shortest stay, 1 to ${rateLimits.maxMinNights} nights.`),
    active: ticked,
  })
  .refine((plan) => plan.nightly >= 100, { message: "Enter a nightly price of at least R1.", path: ["nightly"] });

export type RatePlanDraft = z.output<typeof ratePlanSchema>;

const isoDay = (message: string) => z.string(message).refine(isIsoDate, message);

/** The season form's fixed fields; its prices arrive as "price.<apartment slug>" and are read separately (seasonPricesOf). */
export const seasonSchema = z
  .object({
    name: requiredText({ max: rateLimits.seasonNameMax, required: "Name the season, like Festive season.", tooLong: `Keep the name under ${rateLimits.seasonNameMax} characters.` }),
    firstNight: isoDay("Choose the season's first night."),
    lastNight: isoDay("Choose the season's last night."),
    minNights: z.preprocess(
      (value) => (value === undefined || value === null || (typeof value === "string" && value.trim() === "") ? null : value),
      count(1, rateLimits.maxMinNights, `Enter the shortest stay, 1 to ${rateLimits.maxMinNights} nights, or leave it empty.`).nullable(),
    ),
  })
  .refine((season) => season.lastNight >= season.firstNight, { message: "Choose a last night on or after the first night.", path: ["lastNight"] });

export type SeasonDraft = z.output<typeof seasonSchema>;

export const seasonPricePrefix = "price.";

const seasonPrice = randAmount({ required: "", invalid: "Enter the price in rand, like 950, or leave it empty.", max: maxCheck("this price") });

/**
 * A season's prices from its form: each "price.<slug>" field with an amount,
 * for the apartments in `known`. An empty field means "keep the plan's
 * price"; problems come back keyed by the field's name.
 */
export function seasonPricesOf(input: unknown, known: readonly string[]): { ok: true; prices: Record<string, number> } | { ok: false; errors: Record<string, string> } {
  const fields = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const prices: Record<string, number> = {};
  const errors: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!key.startsWith(seasonPricePrefix)) continue;
    const slug = key.slice(seasonPricePrefix.length);
    if (!known.includes(slug)) continue;
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) continue;
    const parsed = seasonPrice.safeParse(value);
    if (!parsed.success) errors[key] = parsed.error.issues[0]?.message || "Enter the price in rand, like 950, or leave it empty.";
    else if (parsed.data < 100) errors[key] = "Enter a price of at least R1, or leave it empty.";
    else prices[slug] = parsed.data;
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, prices };
}
