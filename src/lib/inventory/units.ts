import { z } from "zod";
import { optionalText, requiredText } from "@/lib/forms/fields";
import { isIsoDate } from "@/lib/format/zoned-time";
import type { Stay } from "./stays";

/**
 * The guesthouse's bookable units: each is one real apartment, of one of the
 * apartment types the site describes (by the type's link name, its slug).
 * A type with three identical apartments has three units. Units are the
 * inventory's own records; the apartment types themselves are site content.
 *
 * Blocks take a unit out of availability for some nights: the owner closing
 * it, maintenance, or an accepted booking request. Two blocks on one unit
 * never share a night (the store guards this; in Postgres, an exclusion
 * constraint). Channel bookings and full bookings arrive in Phase 3.
 */

export type Unit = {
  id: string;
  /** The apartment type's slug (site content, "apartments" section). */
  apartment: string;
  /** What the team calls it: "Unit 3", "Garden apartment". Never shown to guests. */
  name: string;
  /** Its place in lists. */
  sort: number;
  /** Inactive units are kept (for their history) but never offered. */
  active: boolean;
};

export const blockReasons = ["owner", "maintenance", "request"] as const;

export type BlockReason = (typeof blockReasons)[number];

export const blockReasonNames: Record<BlockReason, string> = {
  owner: "Closed",
  maintenance: "Maintenance",
  request: "Booking request",
};

/** The reasons someone can choose in the dashboard; "request" comes only from accepting a request. */
export const manualBlockReasons = ["owner", "maintenance"] as const satisfies readonly BlockReason[];

export type AvailabilityBlock = {
  id: string;
  unitId: string;
  stay: Stay;
  reason: BlockReason;
  /** A private note for the team; never shown to guests. */
  note: string | null;
  /** The booking request that made it, for "request" blocks. */
  requestId: string | null;
  /** Who added it; null for the system. */
  createdBy: string | null;
  createdAt: Date;
};

export const unitLimits = { nameMax: 40, noteMax: 200, maxUnits: 60 } as const;

export const unitInputSchema = z.object({
  apartment: z.string("Choose the apartment.").trim().min(1, "Choose the apartment.").max(48, "Choose the apartment."),
  name: requiredText({ max: unitLimits.nameMax, required: "Name the unit, like Unit 1.", tooLong: `Keep the name under ${unitLimits.nameMax} characters.` }),
});

export type UnitDraft = z.output<typeof unitInputSchema>;

const isoDay = (message: string) => z.string(message).refine(isIsoDate, message);

export const blockInputSchema = z
  .object({
    unitId: z.string("Choose the unit.").trim().min(1, "Choose the unit."),
    arrive: isoDay("Choose the first night it's closed."),
    leave: isoDay("Choose the day it's free again."),
    reason: z.enum(manualBlockReasons, "Choose why it's closed."),
    note: optionalText({ max: unitLimits.noteMax, tooLong: `Keep the note under ${unitLimits.noteMax} characters.` }),
  })
  .refine((block) => block.leave > block.arrive, { message: "Choose a day after the first night.", path: ["leave"] });

export type BlockDraft = z.output<typeof blockInputSchema>;
