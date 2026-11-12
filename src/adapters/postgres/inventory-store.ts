import "server-only";
import type { BlockAdd, InventoryStore, UnitAdd, UnitChange } from "@/lib/inventory/ports";
import { blockReasons, type AvailabilityBlock, type BlockReason, type Unit } from "@/lib/inventory/units";
import type { Database, SqlExecutor } from "./database";
import { ExclusionViolationError, UniqueViolationError } from "./errors";
import { isUuid } from "./uuid";

type UnitRow = { id: string; apartment: string; name: string; sort: number; active: boolean };

type BlockRow = {
  id: string;
  unit_id: string;
  arrive: string;
  leave: string;
  reason: string;
  note: string | null;
  request_id: string | null;
  booking_id: string | null;
  channel_event_id: string | null;
  created_by: string | null;
  created_at: Date;
};

const unitColumns = "id, apartment, name, sort, active";
const blockColumns = "id, unit_id, arrive, leave, reason, note, request_id, booking_id, channel_event_id, created_by, created_at";

const unitOf = (row: UnitRow): Unit => ({ id: row.id, apartment: row.apartment, name: row.name, sort: row.sort, active: row.active });

const isBlockReason = (value: string): value is BlockReason => (blockReasons as readonly string[]).includes(value);

/** A block as stored. The table's check constraint allows only the known reasons; anything else reads as "owner", closed. */
export function blockOf(row: BlockRow): AvailabilityBlock {
  return {
    id: row.id,
    unitId: row.unit_id,
    stay: { arrive: row.arrive, leave: row.leave },
    reason: isBlockReason(row.reason) ? row.reason : "owner",
    note: row.note,
    requestId: row.request_id,
    bookingId: row.booking_id,
    channelEventId: row.channel_event_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/**
 * Inserts a block, unless its unit is missing or inactive. Two blocks on one
 * unit sharing a night are refused by availability_blocks_no_overlap, which
 * throws (and aborts any transaction it's in): the caller turns that into
 * "overlaps". Shared with the booking store, which adds a request's block in
 * the same transaction as accepting it.
 */
export async function insertBlock(sql: SqlExecutor, block: AvailabilityBlock): Promise<"added" | "unit-unavailable"> {
  const { changes } = await sql.run(
    `insert into app.availability_blocks (id, unit_id, arrive, leave, reason, note, request_id, booking_id, channel_event_id, created_by, created_at)
     select :id, :unitId, :arrive::date, :leave::date, :reason, :note, :requestId, :bookingId, :channelEventId, :createdBy, :createdAt
     where exists (select 1 from app.units where id = :unitId and active)`,
    {
      id: block.id,
      unitId: block.unitId,
      arrive: block.stay.arrive,
      leave: block.stay.leave,
      reason: block.reason,
      note: block.note,
      requestId: block.requestId,
      bookingId: block.bookingId,
      channelEventId: block.channelEventId,
      createdBy: block.createdBy,
      createdAt: block.createdAt,
    },
  );
  return changes === 1 ? "added" : "unit-unavailable";
}

export function isOverlap(error: unknown): boolean {
  return error instanceof ExclusionViolationError && error.constraint === "availability_blocks_no_overlap";
}

/** The guesthouse's units and the blocks that close them, in Postgres (./migrations/110-inventory.ts). */
export function createPostgresInventoryStore(db: Database): InventoryStore {
  return {
    async units() {
      return (await db.all<UnitRow>(`select ${unitColumns} from app.units order by sort, name`)).map(unitOf);
    },

    async unit(id) {
      if (!isUuid(id)) return null;
      const row = await db.get<UnitRow>(`select ${unitColumns} from app.units where id = :id`, { id });
      return row ? unitOf(row) : null;
    },

    async blocksOverlapping(range) {
      const rows = await db.all<BlockRow>(
        `select ${blockColumns} from app.availability_blocks
         where daterange(arrive, leave, '[)') && daterange(:arrive::date, :leave::date, '[)')
         order by arrive, unit_id`,
        { arrive: range.arrive, leave: range.leave },
      );
      return rows.map(blockOf);
    },

    async block(id) {
      if (!isUuid(id)) return null;
      const row = await db.get<BlockRow>(`select ${blockColumns} from app.availability_blocks where id = :id`, { id });
      return row ? blockOf(row) : null;
    },

    async addUnit(unit, rules): Promise<UnitAdd> {
      try {
        const { changes } = await db.run(
          `insert into app.units (id, apartment, name, sort, active)
           select :id, :apartment, :name, :sort, :active
           where (select count(*) from app.units) < :maxUnits`,
          { id: unit.id, apartment: unit.apartment, name: unit.name, sort: unit.sort, active: unit.active, maxUnits: rules.maxUnits },
        );
        return changes === 1 ? { status: "added" } : { status: "too-many" };
      } catch (error) {
        if (error instanceof UniqueViolationError && error.constraint === "units_name_unique") return { status: "name-taken" };
        throw error;
      }
    },

    async changeUnit(id, changes): Promise<UnitChange> {
      if (!isUuid(id)) return { status: "missing" };
      try {
        const result = await db.run("update app.units set name = :name, apartment = :apartment, active = :active where id = :id", {
          id,
          name: changes.name,
          apartment: changes.apartment,
          active: changes.active,
        });
        return result.changes === 1 ? { status: "changed" } : { status: "missing" };
      } catch (error) {
        if (error instanceof UniqueViolationError && error.constraint === "units_name_unique") return { status: "name-taken" };
        throw error;
      }
    },

    async addBlock(block): Promise<BlockAdd> {
      if (!isUuid(block.unitId)) return { status: "unit-unavailable" };
      try {
        return { status: await insertBlock(db, block) };
      } catch (error) {
        if (isOverlap(error)) return { status: "overlaps" };
        throw error;
      }
    },

    async removeManualBlock(id) {
      if (!isUuid(id)) return false;
      const { changes } = await db.run("delete from app.availability_blocks where id = :id and reason in ('owner', 'maintenance')", { id });
      return changes === 1;
    },
  };
}
