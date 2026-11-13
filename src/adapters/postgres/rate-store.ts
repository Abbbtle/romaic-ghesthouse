import "server-only";
import type { RateStore, SeasonWrite } from "@/lib/rates/ports";
import type { RatePlan, Season } from "@/lib/rates/rates";
import type { Database, SqlExecutor, SqlTransaction } from "./database";
import { ExclusionViolationError } from "./errors";
import { isUuid } from "./uuid";

type PlanRow = {
  apartment: string;
  nightly_cents: string | number;
  base_guests: number;
  extra_guest_cents: string | number;
  min_nights: number;
  active: boolean;
  updated_at: Date;
  updated_by: string | null;
};

type SeasonRow = { id: string; name: string; starts_on: string; ends_before: string; min_nights: number | null; updated_at: Date; updated_by: string | null };

type SeasonRateRow = { season_id: string; apartment: string; nightly_cents: string | number };

const planColumns = "apartment, nightly_cents, base_guests, extra_guest_cents, min_nights, active, updated_at, updated_by";
const seasonColumns = "id, name, starts_on, ends_before, min_nights, updated_at, updated_by";

const planOf = (row: PlanRow): RatePlan => ({
  apartment: row.apartment,
  nightlyCents: Number(row.nightly_cents),
  baseGuests: row.base_guests,
  extraGuestCents: Number(row.extra_guest_cents),
  minNights: row.min_nights,
  active: row.active,
  updatedAt: row.updated_at,
  updatedBy: row.updated_by,
});

const isOverlap = (error: unknown) => error instanceof ExclusionViolationError && error.constraint === "seasons_no_overlap";

/** Seasons with their prices, read in two queries (rows, then every price for them). */
async function seasonsWithPrices(sql: SqlExecutor, rows: SeasonRow[]): Promise<Season[]> {
  if (rows.length === 0) return [];
  const prices = await sql.all<SeasonRateRow>("select season_id, apartment, nightly_cents from app.season_rates where season_id = any(:ids::uuid[])", {
    ids: `{${rows.map((row) => row.id).join(",")}}`,
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    nights: { arrive: row.starts_on, leave: row.ends_before },
    minNights: row.min_nights,
    prices: Object.fromEntries(prices.filter((price) => price.season_id === row.id).map((price) => [price.apartment, Number(price.nightly_cents)])),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }));
}

async function writePrices(tx: SqlTransaction, season: Season): Promise<void> {
  await tx.run("delete from app.season_rates where season_id = :id", { id: season.id });
  for (const [apartment, cents] of Object.entries(season.prices)) {
    await tx.run("insert into app.season_rates (season_id, apartment, nightly_cents) values (:id, :apartment, :cents)", { id: season.id, apartment, cents });
  }
}

function seasonParams(season: Season) {
  return {
    id: season.id,
    name: season.name,
    startsOn: season.nights.arrive,
    endsBefore: season.nights.leave,
    minNights: season.minNights,
    updatedAt: season.updatedAt,
    updatedBy: season.updatedBy,
  };
}

/** A transaction that stops with an outcome rather than an error, rolling back what came before. */
class Stop extends Error {
  constructor(readonly outcome: SeasonWrite) {
    super("stopped");
  }
}

/** Rate plans and seasons in Postgres (./migrations/220-rates.ts). */
export function createPostgresRateStore(db: Database): RateStore {
  async function seasonWrite(work: (tx: SqlTransaction) => Promise<void>): Promise<SeasonWrite> {
    try {
      await db.transaction(work);
      return { status: "saved" };
    } catch (error) {
      if (error instanceof Stop) return error.outcome;
      if (isOverlap(error)) return { status: "overlaps" };
      throw error;
    }
  }

  return {
    async plans() {
      return (await db.all<PlanRow>(`select ${planColumns} from app.rate_plans order by apartment`)).map(planOf);
    },

    async plan(apartment) {
      const row = await db.get<PlanRow>(`select ${planColumns} from app.rate_plans where apartment = :apartment`, { apartment });
      return row ? planOf(row) : null;
    },

    async savePlan(plan) {
      await db.run(
        `insert into app.rate_plans (${planColumns})
         values (:apartment, :nightlyCents, :baseGuests, :extraGuestCents, :minNights, :active, :updatedAt, :updatedBy)
         on conflict (apartment) do update set nightly_cents = excluded.nightly_cents, base_guests = excluded.base_guests,
           extra_guest_cents = excluded.extra_guest_cents, min_nights = excluded.min_nights, active = excluded.active,
           updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        {
          apartment: plan.apartment,
          nightlyCents: plan.nightlyCents,
          baseGuests: plan.baseGuests,
          extraGuestCents: plan.extraGuestCents,
          minNights: plan.minNights,
          active: plan.active,
          updatedAt: plan.updatedAt,
          updatedBy: plan.updatedBy,
        },
      );
    },

    async removePlan(apartment) {
      const { changes } = await db.run("delete from app.rate_plans where apartment = :apartment", { apartment });
      return changes === 1;
    },

    async seasons() {
      return seasonsWithPrices(db, await db.all<SeasonRow>(`select ${seasonColumns} from app.seasons order by starts_on`));
    },

    async seasonsOverlapping(range) {
      const rows = await db.all<SeasonRow>(
        `select ${seasonColumns} from app.seasons
         where daterange(starts_on, ends_before, '[)') && daterange(:arrive::date, :leave::date, '[)') order by starts_on`,
        { arrive: range.arrive, leave: range.leave },
      );
      return seasonsWithPrices(db, rows);
    },

    async season(id) {
      if (!isUuid(id)) return null;
      const row = await db.get<SeasonRow>(`select ${seasonColumns} from app.seasons where id = :id`, { id });
      return row ? ((await seasonsWithPrices(db, [row]))[0] ?? null) : null;
    },

    async addSeason(season) {
      return seasonWrite(async (tx) => {
        await tx.run(
          `insert into app.seasons (${seasonColumns})
           values (:id, :name, :startsOn::date, :endsBefore::date, :minNights, :updatedAt, :updatedBy)`,
          seasonParams(season),
        );
        await writePrices(tx, season);
      });
    },

    async changeSeason(season) {
      if (!isUuid(season.id)) return { status: "missing" };
      return seasonWrite(async (tx) => {
        const { changes } = await tx.run(
          `update app.seasons set name = :name, starts_on = :startsOn::date, ends_before = :endsBefore::date, min_nights = :minNights,
             updated_at = :updatedAt, updated_by = :updatedBy where id = :id`,
          seasonParams(season),
        );
        if (changes !== 1) throw new Stop({ status: "missing" });
        await writePrices(tx, season);
      });
    },

    async removeSeason(id) {
      if (!isUuid(id)) return false;
      const { changes } = await db.run("delete from app.seasons where id = :id", { id });
      return changes === 1;
    },
  };
}
