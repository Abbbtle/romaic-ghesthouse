import type { Stay } from "@/lib/inventory/stays";
import type { Actor } from "@/lib/kernel/actor";
import type { RatePlan, Season } from "./rates";

/**
 * What the rates core needs from storage. Writes are atomic and refusals
 * come back as values; the store keeps seasons from overlapping (in
 * Postgres, an exclusion constraint), whatever the service checked first.
 */

export type SeasonWrite = { status: "saved" } | { status: "overlaps" } | { status: "missing" };

export interface RateStore {
  plans(): Promise<RatePlan[]>;
  plan(apartment: string): Promise<RatePlan | null>;
  /** Adds or replaces the apartment's plan. */
  savePlan(plan: RatePlan): Promise<void>;
  removePlan(apartment: string): Promise<boolean>;
  /** Every season, earliest first. */
  seasons(): Promise<Season[]>;
  /** Seasons with at least one night in `range`. */
  seasonsOverlapping(range: Stay): Promise<Season[]>;
  season(id: string): Promise<Season | null>;
  /** Adds a season with its prices, unless it shares a night with another ("overlaps"). */
  addSeason(season: Season): Promise<SeasonWrite>;
  /** Replaces a season and all its prices, unless it would share a night with another, or is gone. */
  changeSeason(season: Season): Promise<SeasonWrite>;
  removeSeason(id: string): Promise<boolean>;
}

/** Permission checks, from the accounts core (wired in src/server). */
export type RatePermission = "rates:view" | "rates:manage";

export interface RateAccess {
  can(actor: Actor, permission: RatePermission): boolean;
  assertCan(actor: Actor, permission: RatePermission): void;
}
