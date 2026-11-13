import type { IsoDate } from "@/lib/format/zoned-time";
import { memoryInventoryState, type MemoryInventoryState } from "@/lib/inventory/testing/memory-store";
import { staysOverlap } from "@/lib/inventory/stays";
import type { BookingStore, HousekeepingReport, RequestCreation } from "../ports";
import { statusOn, type BookingRequest } from "../requests";

/**
 * Booking requests in memory, for tests, with the same rules as the Postgres
 * store (./store-contract.ts checks both). It shares the inventory's state
 * so deleting a request can unlink the blocks that pointed at it; the
 * reservations core's memory store accepts requests into bookings.
 */
export function createMemoryBookingStore(
  inventory: MemoryInventoryState = memoryInventoryState(),
  requests: Map<string, BookingRequest> = new Map(),
): BookingStore {

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
    async decline(decline) {
      const request = requests.get(decline.requestId);
      if (!request || !isWaiting(request, decline.today)) return false;
      requests.set(request.id, { ...request, status: "declined", decision: { at: decline.at, by: decline.by, note: decline.note, bookingId: null } });
      return true;
    },
    async housekeeping(rules): Promise<HousekeepingReport> {
      const report: HousekeepingReport = { expired: 0, deleted: 0, visitorKeysForgotten: 0 };
      for (const request of requests.values()) {
        if (request.status === "waiting" && request.stay.arrive < rules.expireArrivingBefore) {
          request.status = "expired";
          request.decision = { at: rules.now, by: null, note: null, bookingId: null };
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
