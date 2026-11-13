import { z } from "zod";
import { parseWith, type Parsed } from "@/lib/forms/parse";
import { addDays, zonedToday, type IsoDate } from "@/lib/format/zoned-time";
import type { Actor } from "@/lib/kernel/actor";
import type { AuditRecorder } from "@/lib/kernel/audit";
import type { Clock, IdGenerator } from "@/lib/kernel/ports";
import { done, refused, refusedWith, type ChangeResult } from "@/lib/kernel/result";
import {
  apartmentStatus,
  freeUnitsFor,
  nightlyAvailability,
  publicAvailability,
  type ApartmentStatus,
  type NightAvailability,
  type PublicApartmentAvailability,
} from "./availability";
import type { InventoryAccess, InventoryStore } from "./ports";
import { stayLabel, stayLimits, stayProblem, type Stay } from "./stays";
import { blockInputSchema, blockReasonNames, unitInputSchema, unitLimits, type AvailabilityBlock, type Unit } from "./units";

/** An apartment type as the inventory sees it, from the site's content. */
export type ApartmentType = { slug: string; name: string; sleeps: number; published: boolean };

export type InventoryServiceDependencies = {
  store: InventoryStore;
  /** Every apartment type in the site's content, in its order, published or not. */
  apartmentTypes: () => Promise<ApartmentType[]>;
  clock: Clock;
  ids: IdGenerator;
  audit: AuditRecorder;
  access: InventoryAccess;
  /** The business's time zone, for "today". */
  timeZone: string;
};

/** The most guests the Book page asks about; bigger groups are a conversation. */
export const maxGuests = 12;

/** A stay and group a guest asked about, checked. */
export type StaySearch = Stay & { guests: number };

const guestsField = z.coerce
  .number({ error: "Choose how many guests." })
  .int("Choose how many guests.")
  .min(1, "Choose at least one guest.")
  .max(maxGuests, `For more than ${maxGuests} guests, WhatsApp or call us.`);

/** Whether an apartment can be requested for a stay, and if not, why. */
export type Requestability =
  | { ok: true; apartment: ApartmentType; status: Exclude<ApartmentStatus, "full"> }
  | { ok: false; reason: "unknown-apartment" | "too-small" | "full" };

/** What the dashboard's apartments page shows. */
export type InventoryOverview = {
  today: IsoDate;
  apartmentTypes: ApartmentType[];
  units: Unit[];
  /** Blocks from today on, soonest first. */
  blocks: AvailabilityBlock[];
  /** Units whose apartment type is no longer in the site's content (its link name changed, or it was removed). */
  orphanUnits: Unit[];
};

const unitNotFound = "That unit no longer exists. Reload the page.";

export function createInventoryService(deps: InventoryServiceDependencies) {
  const { store, clock, ids, audit, access, timeZone } = deps;

  const today = () => zonedToday(clock.now(), timeZone);

  async function publishedTypes(): Promise<ApartmentType[]> {
    return (await deps.apartmentTypes()).filter((type) => type.published);
  }

  /** The blocks that matter for `stay`, read once. */
  const blocksFor = (stay: Stay) => store.blocksOverlapping(stay);

  async function typeNamed(slug: string): Promise<ApartmentType | null> {
    return (await deps.apartmentTypes()).find((type) => type.slug === slug) ?? null;
  }

  async function record(actor: Actor, action: string, summary: string, target: { type: string; id: string }, details?: Record<string, unknown>) {
    await audit.record({ actor, category: "bookings", action, target, summary, details });
  }

  return {
    /** Today in the business's time zone. */
    today,

    /**
     * A stay and group from untrusted input (the Book page's query, a
     * form), checked against today: arriving from today, leaving after
     * arriving, at most 30 nights, at most 18 months ahead, 1 to 12 guests.
     */
    checkSearch(input: { arrive?: unknown; leave?: unknown; guests?: unknown }): Parsed<StaySearch> {
      const problem = stayProblem({ arrive: input.arrive, leave: input.leave }, today());
      const guests = parseWith(guestsField, input.guests ?? "");
      const errors: Record<string, string> = {};
      if (problem) errors[problem.field] = problem.message;
      if (!guests.ok) errors.guests = Object.values(guests.errors)[0] ?? "Choose how many guests.";
      if (problem || !guests.ok) return { ok: false, errors };
      return { ok: true, value: { arrive: input.arrive as IsoDate, leave: input.leave as IsoDate, guests: guests.value } };
    },

    /** The Book page's answer: every published apartment type, whether it fits the group, and its status. Statuses only. */
    async search(search: StaySearch): Promise<PublicApartmentAvailability[]> {
      const [types, units, blocks] = await Promise.all([publishedTypes(), store.units(), blocksFor(search)]);
      return publicAvailability(search, search.guests, types, units, blocks);
    },

    /** Whether `slug` can be requested for `search`: it's published, sleeps the group and isn't full. */
    async requestability(slug: string, search: StaySearch): Promise<Requestability> {
      const apartment = (await publishedTypes()).find((type) => type.slug === slug);
      if (!apartment) return { ok: false, reason: "unknown-apartment" };
      if (apartment.sleeps < search.guests) return { ok: false, reason: "too-small" };
      const [units, blocks] = await Promise.all([store.units(), blocksFor(search)]);
      const status = apartmentStatus(slug, search, units, blocks);
      return status === "full" ? { ok: false, reason: "full" } : { ok: true, apartment, status };
    },

    /**
     * A published apartment type's nights from `from` for `nights` nights,
     * each free, full or not set up: the calendar on its page. Nights
     * before today are left out.
     */
    async calendar(slug: string, from: IsoDate, nights: number): Promise<NightAvailability[]> {
      const start = from < today() ? today() : from;
      const until = addDays(start, Math.max(0, Math.min(nights, stayLimits.maxDaysAhead)));
      const [units, blocks] = await Promise.all([store.units(), blocksFor({ arrive: start, leave: until })]);
      return nightlyAvailability(slug, start, until, units, blocks);
    },

    /** Units of `slug` free for every night of `stay`: the choices when accepting a request. */
    async freeUnits(actor: Actor, slug: string, stay: Stay): Promise<Unit[]> {
      access.assertCan(actor, "availability:view");
      const [units, blocks] = await Promise.all([store.units(), blocksFor(stay)]);
      return freeUnitsFor(slug, stay, units, blocks);
    },

    /** The dashboard's apartments page: types, units, and blocks from today on. */
    async overview(actor: Actor): Promise<InventoryOverview> {
      access.assertCan(actor, "availability:view");
      const from = today();
      const [apartmentTypes, units, blocks] = await Promise.all([
        deps.apartmentTypes(),
        store.units(),
        store.blocksOverlapping({ arrive: from, leave: addDays(from, stayLimits.maxDaysAhead + stayLimits.maxNights) }),
      ]);
      const known = new Set(apartmentTypes.map((type) => type.slug));
      const sortedUnits = [...units].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
      return {
        today: from,
        apartmentTypes,
        units: sortedUnits,
        blocks: [...blocks].sort((a, b) => a.stay.arrive.localeCompare(b.stay.arrive)),
        orphanUnits: sortedUnits.filter((unit) => !known.has(unit.apartment)),
      };
    },

    async addUnit(actor: Actor, input: unknown): Promise<ChangeResult<{ id: string }>> {
      access.assertCan(actor, "rates:manage");
      const parsed = parseWith(unitInputSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const type = await typeNamed(parsed.value.apartment);
      if (!type) return refused({ apartment: "Choose an apartment from the list." });
      const units = await store.units();
      const unit: Unit = { id: ids.newId(), apartment: type.slug, name: parsed.value.name, sort: units.length + 1, active: true };
      const outcome = await store.addUnit(unit, { maxUnits: unitLimits.maxUnits });
      if (outcome.status === "name-taken") return refused({ name: "Another unit already has this name." });
      if (outcome.status === "too-many") return refusedWith(`There can be at most ${unitLimits.maxUnits} units.`);
      await record(actor, "inventory.unit-added", `Added ${unit.name} (${type.name})`, { type: "unit", id: unit.id });
      return done({ id: unit.id });
    },

    async changeUnit(actor: Actor, id: string, input: unknown): Promise<ChangeResult> {
      access.assertCan(actor, "rates:manage");
      const parsed = parseWith(unitInputSchema.extend({ active: z.boolean("Reload the page and try again.") }), input);
      if (!parsed.ok) return refused(parsed.errors);
      const existing = await store.unit(id);
      if (!existing) return refusedWith(unitNotFound);
      const type = await typeNamed(parsed.value.apartment);
      if (!type) return refused({ apartment: "Choose an apartment from the list." });
      const outcome = await store.changeUnit(id, { name: parsed.value.name, apartment: type.slug, active: parsed.value.active });
      if (outcome.status === "missing") return refusedWith(unitNotFound);
      if (outcome.status === "name-taken") return refused({ name: "Another unit already has this name." });
      const changes = [
        existing.name !== parsed.value.name && `renamed from ${existing.name}`,
        existing.apartment !== type.slug && `moved to ${type.name}`,
        existing.active !== parsed.value.active && (parsed.value.active ? "offered again" : "no longer offered"),
      ].filter(Boolean);
      await record(actor, "inventory.unit-changed", `Changed ${parsed.value.name}${changes.length > 0 ? `: ${changes.join(", ")}` : ""}`, {
        type: "unit",
        id,
      });
      return done();
    },

    /** Offers a unit again, or stops offering it (it stays in the records). */
    async setUnitOffered(actor: Actor, id: string, offered: boolean): Promise<ChangeResult> {
      access.assertCan(actor, "rates:manage");
      const unit = await store.unit(id);
      if (!unit) return refusedWith(unitNotFound);
      if (unit.active === offered) return done();
      const outcome = await store.changeUnit(id, { name: unit.name, apartment: unit.apartment, active: offered });
      if (outcome.status !== "changed") return refusedWith(unitNotFound);
      await record(actor, "inventory.unit-changed", `${offered ? "Offered" : "Stopped offering"} ${unit.name}`, { type: "unit", id });
      return done();
    },

    /** Closes a unit for some nights (the owner's use, maintenance). */
    async addBlock(actor: Actor, input: unknown): Promise<ChangeResult<{ id: string }>> {
      access.assertCan(actor, "rates:manage");
      const parsed = parseWith(blockInputSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const { unitId, arrive, leave, reason, note } = parsed.value;
      if (arrive < today()) return refused({ arrive: "Choose a first night from today onwards." });
      const block: AvailabilityBlock = {
        id: ids.newId(),
        unitId,
        stay: { arrive, leave },
        reason,
        note,
        requestId: null,
        createdBy: actor.id,
        createdAt: clock.now(),
      };
      const outcome = await store.addBlock(block);
      if (outcome.status === "unit-unavailable") return refused({ unitId: "Choose a unit that's offered." });
      if (outcome.status === "overlaps") return refused({ arrive: "This unit is already closed or booked on some of these nights." });
      const unit = await store.unit(unitId);
      await record(actor, "inventory.block-added", `Closed ${unit?.name ?? "a unit"} for ${stayLabel({ arrive, leave })} (${blockReasonNames[reason]})`, {
        type: "block",
        id: block.id,
      });
      return done({ id: block.id });
    },

    /** Opens nights a manual block closed. A booking request's nights open only when the request is handled. */
    async removeBlock(actor: Actor, id: string): Promise<ChangeResult> {
      access.assertCan(actor, "rates:manage");
      const block = await store.block(id);
      if (!block) return refusedWith("Those nights are already open. Reload the page.");
      if (block.reason === "request") return refusedWith("These nights belong to an accepted booking request.");
      if (!(await store.removeManualBlock(id))) return refusedWith("Those nights are already open. Reload the page.");
      const unit = await store.unit(block.unitId);
      await record(
        actor,
        "inventory.block-removed",
        `Opened ${unit?.name ?? "a unit"} for ${stayLabel(block.stay)}`,
        { type: "block", id },
      );
      return done();
    },
  };
}

export type InventoryService = ReturnType<typeof createInventoryService>;
