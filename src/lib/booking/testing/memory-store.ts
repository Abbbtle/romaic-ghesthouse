import type { IsoDate } from "@/lib/format/zoned-time";
import { memoryBlockOutcome, memoryInventoryState, type MemoryInventoryState } from "@/lib/inventory/testing/memory-store";
import { staysOverlap } from "@/lib/inventory/stays";
import type { AcceptOutcome, BookingStore, HousekeepingReport, RequestCreation } from "../ports";
import { statusOn, type BookingRequest } from "../requests";

/**
 * Booking requests in memory, for tests, with the same rules as the Postgres
 * store (./store-contract.ts checks both). Accepting writes the block into
 * the inventory's shared state, so the two can't both take a night.
 */
export function createMemoryBookingStore(inventory: MemoryInventoryState = memoryInventoryState()): BookingStore {
  const requests = new Map<string, BookingRequest>();

  const copy = (request: BookingRequest): BookingRequest => structuredClone(request);
  const isWaiting = (request: BookingRequest, today: IsoDate) => statusOn(request, today) === "waiting";
  const decidedOrSent = (request: BookingRequest) => (request.decision?.at ?? request.createdAt).getTime();

  return {
    async request(id) {
      const request = requests.get(id);
      return request ? copy(request) : null;
    },
    async waiting(today, limit) {
      return [...requests.values()]
        .filter((request) => isWaiting(request, today))
        .sort((a, b) => a.stay.arrive.localeCompare(b.stay.arrive) || a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, limit)
        .map(copy);
    },
    async handled(today, limit) {
      return [...requests.values()]
        .filter((request) => !isWaiting(request, today))
        .sort((a, b) => decidedOrSent(b) - decidedOrSent(a))
        .slice(0, limit)
        .map(copy);
    },
    async waitingCount(today) {
      return [...requests.values()].filter((request) => isWaiting(request, today)).length;
    },
    async create(request, rules): Promise<RequestCreation> {
      if ([...requests.values()].some((other) => other.ref === request.ref)) return { status: "ref-taken" };
      const samePhone = [...requests.values()].filter((other) => other.phone === request.phone && isWaiting(other, rules.today));
      if (samePhone.some((other) => other.apartment === request.apartment && staysOverlap(other.stay, request.stay))) return { status: "duplicate" };
      if (samePhone.length >= rules.maxWaitingPerPhone) return { status: "too-many-waiting" };
      requests.set(request.id, copy(request));
      return { status: "created" };
    },
    async accept(acceptance): Promise<AcceptOutcome> {
      const request = requests.get(acceptance.requestId);
      if (!request || !isWaiting(request, acceptance.today)) return { status: "request-changed" };
      const outcome = memoryBlockOutcome(inventory, acceptance.block);
      if (outcome.status !== "added") return outcome;
      inventory.blocks.set(acceptance.block.id, structuredClone(acceptance.block));
      requests.set(request.id, {
        ...request,
        status: "accepted",
        decision: { at: acceptance.at, by: acceptance.by, note: null, unitId: acceptance.block.unitId },
      });
      return { status: "accepted" };
    },
    async decline(decline) {
      const request = requests.get(decline.requestId);
      if (!request || !isWaiting(request, decline.today)) return false;
      requests.set(request.id, { ...request, status: "declined", decision: { at: decline.at, by: decline.by, note: decline.note, unitId: null } });
      return true;
    },
    async release(release) {
      const request = requests.get(release.requestId);
      if (!request || request.status !== "accepted" || request.stay.leave <= release.today) return false;
      for (const [id, block] of inventory.blocks) if (block.requestId === request.id) inventory.blocks.delete(id);
      requests.set(request.id, { ...request, status: "declined", decision: { at: release.at, by: release.by, note: release.note, unitId: null } });
      return true;
    },
    async housekeeping(rules): Promise<HousekeepingReport> {
      const report: HousekeepingReport = { expired: 0, deleted: 0, visitorKeysForgotten: 0 };
      for (const request of requests.values()) {
        if (request.status === "waiting" && request.stay.arrive < rules.expireArrivingBefore) {
          request.status = "expired";
          request.decision = { at: rules.now, by: null, note: null, unitId: null };
          report.expired += 1;
        }
      }
      for (const [id, request] of requests) {
        const decidedLongAgo = (request.status === "declined" || request.status === "expired") && request.decision!.at < rules.deleteDecidedBefore;
        const stayLongOver = request.status === "accepted" && request.stay.leave < rules.deleteAcceptedLeavingBefore;
        if (decidedLongAgo || stayLongOver) {
          requests.delete(id);
          for (const block of inventory.blocks.values()) if (block.requestId === id) block.requestId = null;
          report.deleted += 1;
        }
      }
      for (const request of requests.values()) {
        if (request.visitorKey !== null && request.createdAt < rules.forgetVisitorKeysBefore) {
          request.visitorKey = null;
          report.visitorKeysForgotten += 1;
        }
      }
      return report;
    },
  };
}
