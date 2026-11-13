import { staysOverlap } from "@/lib/inventory/stays";
import type { RateStore, SeasonWrite } from "../ports";
import type { RatePlan, Season } from "../rates";

/** Rate plans and seasons in memory, for tests, with the Postgres store's rules (./store-contract.ts checks both). */
export function createMemoryRateStore(): RateStore {
  const plans = new Map<string, RatePlan>();
  const seasons = new Map<string, Season>();
  const copy = <T>(value: T): T => structuredClone(value);
  const clashes = (season: Season) => [...seasons.values()].some((other) => other.id !== season.id && staysOverlap(other.nights, season.nights));
  const earliestFirst = (list: Season[]) => list.sort((a, b) => a.nights.arrive.localeCompare(b.nights.arrive));

  return {
    async plans() {
      return [...plans.values()].sort((a, b) => a.apartment.localeCompare(b.apartment)).map(copy);
    },
    async plan(apartment) {
      const plan = plans.get(apartment);
      return plan ? copy(plan) : null;
    },
    async savePlan(plan) {
      plans.set(plan.apartment, copy(plan));
    },
    async removePlan(apartment) {
      return plans.delete(apartment);
    },
    async seasons() {
      return earliestFirst([...seasons.values()]).map(copy);
    },
    async seasonsOverlapping(range) {
      return earliestFirst([...seasons.values()].filter((season) => staysOverlap(season.nights, range))).map(copy);
    },
    async season(id) {
      const season = seasons.get(id);
      return season ? copy(season) : null;
    },
    async addSeason(season): Promise<SeasonWrite> {
      if (clashes(season)) return { status: "overlaps" };
      seasons.set(season.id, copy(season));
      return { status: "saved" };
    },
    async changeSeason(season): Promise<SeasonWrite> {
      if (!seasons.has(season.id)) return { status: "missing" };
      if (clashes(season)) return { status: "overlaps" };
      seasons.set(season.id, copy(season));
      return { status: "saved" };
    },
    async removeSeason(id) {
      return seasons.delete(id);
    },
  };
}
