import "server-only";
import type { BookingStore, HousekeepingReport, RequestCreation } from "@/lib/booking/ports";
import { requestStatuses, type BookingRequest, type RequestStatus } from "@/lib/booking/requests";
import type { Database } from "./database";
import { UniqueViolationError } from "./errors";
import { advisoryLocks } from "./locks";
import { isUuid } from "./uuid";

type RequestRow = {
  id: string;
  reference: string;
  apartment: string;
  apartment_name: string;
  arrive: string;
  leave: string;
  adults: number;
  children: number;
  name: string;
  phone: string;
  email: string | null;
  arrival_time: string | null;
  notes: string | null;
  consented_at: Date;
  consent_version: string;
  notice_version: string;
  status: string;
  visitor_key: string | null;
  created_at: Date;
  decided_at: Date | null;
  decided_by: string | null;
  decision_note: string | null;
  booking_id: string | null;
};

const columns = `id, reference, apartment, apartment_name, arrive, leave, adults, children, name, phone, email, arrival_time, notes,
  consented_at, consent_version, notice_version, status, visitor_key, created_at, decided_at, decided_by, decision_note, booking_id`;

const isStatus = (value: string): value is RequestStatus => (requestStatuses as readonly string[]).includes(value);

/** "Waiting on :today": the one definition every query shares. */
const waitingOn = "status = 'waiting' and arrive >= :today::date";

function requestOf(row: RequestRow): BookingRequest {
  return {
    id: row.id,
    ref: row.reference,
    apartment: row.apartment,
    apartmentName: row.apartment_name,
    stay: { arrive: row.arrive, leave: row.leave },
    adults: row.adults,
    children: row.children,
    name: row.name,
    phone: row.phone,
    email: row.email,
    arrivalTime: row.arrival_time,
    notes: row.notes,
    consent: { at: row.consented_at, consentVersion: row.consent_version, noticeVersion: row.notice_version },
    // The table's check constraint allows only the known statuses; anything else reads as handled.
    status: isStatus(row.status) ? row.status : "declined",
    visitorKey: row.visitor_key,
    createdAt: row.created_at,
    decision: row.decided_at ? { at: row.decided_at, by: row.decided_by, note: row.decision_note, bookingId: row.booking_id } : null,
  };
}

/** Booking requests in Postgres (./migrations/120-booking-requests.ts). Accepting one is the reservation store's (./reservation-store.ts). */
export function createPostgresBookingStore(db: Database): BookingStore {
  return {
    async request(id) {
      if (!isUuid(id)) return null;
      const row = await db.get<RequestRow>(`select ${columns} from app.booking_requests where id = :id`, { id });
      return row ? requestOf(row) : null;
    },

    async waiting(today, limit) {
      const rows = await db.all<RequestRow>(`select ${columns} from app.booking_requests where ${waitingOn} order by arrive, created_at limit :limit`, {
        today,
        limit,
      });
      return rows.map(requestOf);
    },

    async handled(today, limit) {
      const rows = await db.all<RequestRow>(
        `select ${columns} from app.booking_requests where not (${waitingOn})
         order by coalesce(decided_at, created_at) desc limit :limit`,
        { today, limit },
      );
      return rows.map(requestOf);
    },

    async waitingCount(today) {
      const row = await db.get<{ count: number }>(`select count(*)::int as count from app.booking_requests where ${waitingOn}`, { today });
      return row?.count ?? 0;
    },

    async create(request, rules): Promise<RequestCreation> {
      try {
        return await db.transaction(async (tx) => {
          // One phone at a time, so two requests sent together can't both slip past the limits.
          await tx.run("select pg_advisory_xact_lock(:lock::int4, hashtext(:phone))", { lock: advisoryLocks.booking, phone: request.phone });
          const counts = await tx.get<{ waiting: number; duplicates: number }>(
            `select count(*)::int as waiting,
               count(*) filter (where apartment = :apartment and daterange(arrive, leave, '[)') && daterange(:arrive::date, :leave::date, '[)'))::int as duplicates
             from app.booking_requests where phone = :phone and ${waitingOn}`,
            { phone: request.phone, apartment: request.apartment, arrive: request.stay.arrive, leave: request.stay.leave, today: rules.today },
          );
          if ((counts?.duplicates ?? 0) > 0) return { status: "duplicate" } as const;
          if ((counts?.waiting ?? 0) >= rules.maxWaitingPerPhone) return { status: "too-many-waiting" } as const;
          await tx.run(
            `insert into app.booking_requests (${columns})
             values (:id, :reference, :apartment, :apartmentName, :arrive::date, :leave::date, :adults, :children, :name, :phone, :email,
               :arrivalTime, :notes, :consentedAt, :consentVersion, :noticeVersion, :status, :visitorKey, :createdAt, :decidedAt, :decidedBy,
               :decisionNote, :bookingId)`,
            {
              id: request.id,
              reference: request.ref,
              apartment: request.apartment,
              apartmentName: request.apartmentName,
              arrive: request.stay.arrive,
              leave: request.stay.leave,
              adults: request.adults,
              children: request.children,
              name: request.name,
              phone: request.phone,
              email: request.email,
              arrivalTime: request.arrivalTime,
              notes: request.notes,
              consentedAt: request.consent.at,
              consentVersion: request.consent.consentVersion,
              noticeVersion: request.consent.noticeVersion,
              status: request.status,
              visitorKey: request.visitorKey,
              createdAt: request.createdAt,
              decidedAt: request.decision?.at ?? null,
              decidedBy: request.decision?.by ?? null,
              decisionNote: request.decision?.note ?? null,
              bookingId: request.decision?.bookingId ?? null,
            },
          );
          return { status: "created" } as const;
        });
      } catch (error) {
        if (error instanceof UniqueViolationError && error.constraint === "booking_requests_reference_unique") return { status: "ref-taken" };
        throw error;
      }
    },

    async decline({ requestId, at, by, note, today }) {
      if (!isUuid(requestId)) return false;
      const { changes } = await db.run(
        `update app.booking_requests set status = 'declined', decided_at = :at, decided_by = :by, decision_note = :note
         where id = :id and ${waitingOn}`,
        { id: requestId, at, by, note, today },
      );
      return changes === 1;
    },

    async housekeeping(rules): Promise<HousekeepingReport> {
      return db.transaction(async (tx) => {
        const expired = await tx.run(
          "update app.booking_requests set status = 'expired', decided_at = :now where status = 'waiting' and arrive < :before::date",
          { now: rules.now, before: rules.expireArrivingBefore },
        );
        const deleted = await tx.run(
          `delete from app.booking_requests
           where (status in ('declined', 'expired') and decided_at < :decidedBefore)
              or (status = 'accepted' and leave < :leavingBefore::date)`,
          { decidedBefore: rules.deleteDecidedBefore, leavingBefore: rules.deleteAcceptedLeavingBefore },
        );
        const forgotten = await tx.run("update app.booking_requests set visitor_key = null where visitor_key is not null and created_at < :before", {
          before: rules.forgetVisitorKeysBefore,
        });
        return { expired: expired.changes, deleted: deleted.changes, visitorKeysForgotten: forgotten.changes };
      });
    },
  };
}
