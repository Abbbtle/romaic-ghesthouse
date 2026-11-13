import "server-only";
import { businessTimeZone } from "@/lib/format/zoned-time";
import type { GuestAnonymising, PrivacyStore, RetentionStore } from "@/lib/privacy/ports";
import {
  activeStayStatuses,
  anonymisedGuestName,
  breachStatuses,
  requestKinds,
  requestStatuses,
  type Breach,
  type BreachStatus,
  type DataSubjectRequest,
  type RequestKind,
  type RequestStatus,
} from "@/lib/privacy/privacy";
import { retentionKinds, type RetentionKind, type RetentionPolicy } from "@/lib/privacy/retention";
import { jsonParam, type Database, type SqlExecutor } from "./database";
import { UniqueViolationError } from "./errors";
import { isUuid } from "./uuid";

type RequestRow = {
  id: string;
  kind: string;
  requester_name: string;
  contact_sealed: string | null;
  contact_hint: string | null;
  received_on: string;
  due_on: string;
  status: string;
  details: string | null;
  notes: string | null;
  guest_id: string | null;
  identity_confirmed_on: string | null;
  identity_note: string | null;
  closed_on: string | null;
  outcome: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  revision: number;
};

type BreachRow = {
  id: string;
  discovered_on: string;
  summary: string;
  data_involved: string;
  people_affected: number | null;
  status: string;
  contained_on: string | null;
  regulator_told_on: string | null;
  regulator_reference: string | null;
  people_told_on: string | null;
  people_told_how: string | null;
  actions: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  revision: number;
};

type OfficerRow = { name: string; email: string; phone: string | null; registration_reference: string | null; updated_at: Date; updated_by: string | null };

type PolicyRow = { id: string; kind: string; version: number; period: number | null; set_by: string; set_by_name: string; set_at: Date };

type RunRow = { id: string; ran_at: Date; guests_anonymised: number; photos_deleted: number; skipped: unknown };

const requestColumns = `id, kind, requester_name, contact_sealed, contact_hint, received_on, due_on, status, details, notes, guest_id, identity_confirmed_on,
  identity_note, closed_on, outcome, created_by, created_at, updated_at, revision`;
const breachColumns = `id, discovered_on, summary, data_involved, people_affected, status, contained_on, regulator_told_on, regulator_reference, people_told_on,
  people_told_how, actions, created_by, created_at, updated_at, revision`;

const oneOf = <T extends string>(values: readonly T[], value: string, fallback: T): T => ((values as readonly string[]).includes(value) ? (value as T) : fallback);

function requestOf(row: RequestRow): DataSubjectRequest {
  return {
    id: row.id,
    // Check constraints allow only the known values; anything else reads as the most cautious one (still open).
    kind: oneOf<RequestKind>(requestKinds, row.kind, "other"),
    requesterName: row.requester_name,
    contactSealed: row.contact_sealed,
    contactHint: row.contact_hint,
    receivedOn: row.received_on,
    dueOn: row.due_on,
    status: oneOf<RequestStatus>(requestStatuses, row.status, "received"),
    details: row.details,
    notes: row.notes,
    guestId: row.guest_id,
    identityConfirmedOn: row.identity_confirmed_on,
    identityNote: row.identity_note,
    closedOn: row.closed_on,
    outcome: row.outcome,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: Number(row.revision),
  };
}

function breachOf(row: BreachRow): Breach {
  return {
    id: row.id,
    discoveredOn: row.discovered_on,
    summary: row.summary,
    dataInvolved: row.data_involved,
    peopleAffected: row.people_affected === null ? null : Number(row.people_affected),
    status: oneOf<BreachStatus>(breachStatuses, row.status, "ongoing"),
    containedOn: row.contained_on,
    regulatorToldOn: row.regulator_told_on,
    regulatorReference: row.regulator_reference,
    peopleToldOn: row.people_told_on,
    peopleToldHow: row.people_told_how,
    actions: row.actions,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: Number(row.revision),
  };
}

function policyOf(row: PolicyRow): RetentionPolicy {
  return {
    id: row.id,
    kind: oneOf<RetentionKind>(retentionKinds, row.kind, "audit-log"),
    version: Number(row.version),
    period: row.period === null ? null : Number(row.period),
    setBy: row.set_by,
    setByName: row.set_by_name,
    setAt: row.set_at,
  };
}

/** JSON as stored: PGlite gives jsonb parsed, node-postgres too; a string is parsed once more to be safe. */
const json = (value: unknown): unknown => (typeof value === "string" ? JSON.parse(value) : value);

const uuidOrNull = (value: string | null) => (value !== null && isUuid(value) ? value : null);

function requestParams(request: DataSubjectRequest) {
  return {
    id: request.id,
    kind: request.kind,
    requesterName: request.requesterName,
    contactSealed: request.contactSealed,
    contactHint: request.contactHint,
    receivedOn: request.receivedOn,
    dueOn: request.dueOn,
    status: request.status,
    details: request.details,
    notes: request.notes,
    guestId: uuidOrNull(request.guestId),
    identityConfirmedOn: request.identityConfirmedOn,
    identityNote: request.identityNote,
    closedOn: request.closedOn,
    outcome: request.outcome,
    createdBy: uuidOrNull(request.createdBy),
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    revision: request.revision,
  };
}

function breachParams(breach: Breach) {
  return {
    id: breach.id,
    discoveredOn: breach.discoveredOn,
    summary: breach.summary,
    dataInvolved: breach.dataInvolved,
    peopleAffected: breach.peopleAffected,
    status: breach.status,
    containedOn: breach.containedOn,
    regulatorToldOn: breach.regulatorToldOn,
    regulatorReference: breach.regulatorReference,
    peopleToldOn: breach.peopleToldOn,
    peopleToldHow: breach.peopleToldHow,
    actions: breach.actions,
    createdBy: uuidOrNull(breach.createdBy),
    createdAt: breach.createdAt,
    updatedAt: breach.updatedAt,
    revision: breach.revision,
  };
}

/** The registers in Postgres (./migrations/400-privacy.ts): requests, breaches, the officer, retention policies and runs. */
export function createPostgresPrivacyStore(db: Database): PrivacyStore {
  return {
    async requests() {
      const rows = await db.all<RequestRow>(`select ${requestColumns} from app.privacy_requests order by created_at desc, id`);
      return rows.map(requestOf);
    },

    async request(id) {
      if (!isUuid(id)) return null;
      const row = await db.get<RequestRow>(`select ${requestColumns} from app.privacy_requests where id = :id`, { id });
      return row ? requestOf(row) : null;
    },

    async addRequest(request) {
      await db.run(
        `insert into app.privacy_requests (${requestColumns})
         values (:id, :kind, :requesterName, :contactSealed, :contactHint, :receivedOn::date, :dueOn::date, :status, :details, :notes, :guestId::uuid,
           :identityConfirmedOn::date, :identityNote, :closedOn::date, :outcome, :createdBy::uuid, :createdAt, :updatedAt, :revision)`,
        requestParams(request),
      );
    },

    async updateRequest(request, expectedRevision) {
      if (!isUuid(request.id)) return false;
      const { changes } = await db.run(
        `update app.privacy_requests set kind = :kind, requester_name = :requesterName, contact_sealed = :contactSealed, contact_hint = :contactHint,
           received_on = :receivedOn::date, due_on = :dueOn::date, status = :status, details = :details, notes = :notes, guest_id = :guestId::uuid,
           identity_confirmed_on = :identityConfirmedOn::date, identity_note = :identityNote, closed_on = :closedOn::date, outcome = :outcome,
           updated_at = :updatedAt, revision = :revision
         where id = :id and revision = :expectedRevision`,
        { ...requestParams(request), expectedRevision },
      );
      return changes === 1;
    },

    async breaches() {
      const rows = await db.all<BreachRow>(`select ${breachColumns} from app.privacy_breaches order by created_at desc, id`);
      return rows.map(breachOf);
    },

    async breach(id) {
      if (!isUuid(id)) return null;
      const row = await db.get<BreachRow>(`select ${breachColumns} from app.privacy_breaches where id = :id`, { id });
      return row ? breachOf(row) : null;
    },

    async addBreach(breach) {
      await db.run(
        `insert into app.privacy_breaches (${breachColumns})
         values (:id, :discoveredOn::date, :summary, :dataInvolved, :peopleAffected, :status, :containedOn::date, :regulatorToldOn::date, :regulatorReference,
           :peopleToldOn::date, :peopleToldHow, :actions, :createdBy::uuid, :createdAt, :updatedAt, :revision)`,
        breachParams(breach),
      );
    },

    async updateBreach(breach, expectedRevision) {
      if (!isUuid(breach.id)) return false;
      const { changes } = await db.run(
        `update app.privacy_breaches set discovered_on = :discoveredOn::date, summary = :summary, data_involved = :dataInvolved, people_affected = :peopleAffected,
           status = :status, contained_on = :containedOn::date, regulator_told_on = :regulatorToldOn::date, regulator_reference = :regulatorReference,
           people_told_on = :peopleToldOn::date, people_told_how = :peopleToldHow, actions = :actions, updated_at = :updatedAt, revision = :revision
         where id = :id and revision = :expectedRevision`,
        { ...breachParams(breach), expectedRevision },
      );
      return changes === 1;
    },

    async officer() {
      const row = await db.get<OfficerRow>("select name, email, phone, registration_reference, updated_at, updated_by from app.privacy_officer where id = 1");
      return row ? { name: row.name, email: row.email, phone: row.phone, registrationReference: row.registration_reference, updatedAt: row.updated_at, updatedBy: row.updated_by } : null;
    },

    async saveOfficer(officer) {
      await db.run(
        `insert into app.privacy_officer (id, name, email, phone, registration_reference, updated_at, updated_by)
         values (1, :name, :email, :phone, :registrationReference, :updatedAt, :updatedBy::uuid)
         on conflict (id) do update set name = excluded.name, email = excluded.email, phone = excluded.phone,
           registration_reference = excluded.registration_reference, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        {
          name: officer.name,
          email: officer.email,
          phone: officer.phone,
          registrationReference: officer.registrationReference,
          updatedAt: officer.updatedAt,
          updatedBy: uuidOrNull(officer.updatedBy),
        },
      );
    },

    async policies() {
      const rows = await db.all<PolicyRow>("select id, kind, version, period, set_by, set_by_name, set_at from app.retention_policies order by kind, version");
      return rows.map(policyOf);
    },

    async addPolicy(policy) {
      try {
        await db.run(
          `insert into app.retention_policies (id, kind, version, period, set_by, set_by_name, set_at)
           values (:id, :kind, :version, :period, :setBy::uuid, :setByName, :setAt)`,
          { id: policy.id, kind: policy.kind, version: policy.version, period: policy.period, setBy: policy.setBy, setByName: policy.setByName, setAt: policy.setAt },
        );
        return "added";
      } catch (error) {
        if (error instanceof UniqueViolationError && error.constraint === "retention_policies_version_unique") return "version-taken";
        throw error;
      }
    },

    async runs(limit) {
      const rows = await db.all<RunRow>("select id, ran_at, guests_anonymised, photos_deleted, skipped from app.retention_runs order by ran_at desc, id limit :limit", {
        limit: Math.max(1, Math.min(limit, 100)),
      });
      return rows.map((row) => {
        const skipped = json(row.skipped);
        return {
          id: row.id,
          ranAt: row.ran_at,
          guestsAnonymised: Number(row.guests_anonymised),
          photosDeleted: Number(row.photos_deleted),
          skipped: Array.isArray(skipped) ? skipped.filter((reason): reason is string => typeof reason === "string") : [],
        };
      });
    },

    async addRun(run) {
      await db.run(
        `insert into app.retention_runs (id, ran_at, guests_anonymised, photos_deleted, skipped)
         values (:id, :ranAt, :guestsAnonymised, :photosDeleted, :skipped)`,
        { id: run.id, ranAt: run.ranAt, guestsAnonymised: run.guestsAnonymised, photosDeleted: run.photosDeleted, skipped: jsonParam(run.skipped) },
      );
    },
  };
}

const activeStatuses = activeStayStatuses.map((status) => `'${status}'`).join(", ");

/**
 * Guests who may be anonymised by the schedule: not anonymised yet, nothing
 * booked or under way, and their last stay, payment or invoice (or, with
 * none, the record itself) before :before. GREATEST skips the nulls of a
 * guest without bookings. The guest's creation instant is read as a
 * Johannesburg calendar day.
 */
const inactiveGuests = `
  select g.id from app.guests g
  where g.anonymised_at is null
    and not exists (select 1 from app.bookings b where b.guest_id = g.id and b.status in (${activeStatuses}))
    and greatest(
      (g.created_at at time zone '${businessTimeZone}')::date,
      (select max(b.leave) from app.bookings b where b.guest_id = g.id),
      (select max(p.received_on) from app.payments p join app.bookings b on b.id = p.booking_id where b.guest_id = g.id),
      (select max(i.issued_on) from app.invoices i join app.bookings b on b.id = i.booking_id where b.guest_id = g.id)
    ) < :before::date`;

/** Clears a set of guests' details and their bookings' free-text notes, in the caller's transaction; answers the bookings changed. */
async function anonymiseWhere(tx: SqlExecutor, guestIds: string, params: Record<string, string | Date>): Promise<{ guests: number; bookings: number }> {
  const guests = await tx.run(
    `update app.guests set name = :anonymisedName, phone = null, email = null, notes = null, anonymised_at = :at, updated_at = :at
     where anonymised_at is null and id in (${guestIds})`,
    { ...params, anonymisedName: anonymisedGuestName },
  );
  const bookings = await tx.run(
    `update app.bookings set notes = null, service_notes = null, cancel_reason = null, updated_at = :at, revision = revision + 1
     where guest_id in (select id from app.guests where anonymised_at = :at and name = :anonymisedName)
       and (notes is not null or service_notes is not null or cancel_reason is not null)`,
    { ...params, anonymisedName: anonymisedGuestName },
  );
  // A stay's clean was titled with the guest's first name ("Clean Unit 2 after Thandi", src/lib/tasks): the name goes too.
  await tx.run(
    `update app.tasks set title = regexp_replace(title, ' after .*$', '')
     where kind = 'housekeeping' and title like '% after %'
       and booking_id in (select b.id from app.bookings b join app.guests g on g.id = b.guest_id where g.anonymised_at = :at and g.name = :anonymisedName)`,
    { ...params, anonymisedName: anonymisedGuestName },
  );
  return { guests: guests.changes, bookings: bookings.changes };
}

/**
 * The retention job's writes in Postgres: anonymising guests (never their
 * bookings, payments or invoices, which are financial records and keep
 * pointing at the guest; invoices keep the name they were billed to, as the
 * money migration requires) and deleting old task photos.
 */
export function createPostgresRetentionStore(db: Database): RetentionStore {
  const photosDoneBefore = `
    select p.task_id, p.file_id from app.task_photos p join app.tasks t on t.id = p.task_id
    where t.status = 'done' and t.done_at < :doneBefore`;

  return {
    async countInactiveGuests(before) {
      const row = await db.get<{ count: number }>(`select count(*)::int as count from (${inactiveGuests}) found`, { before });
      return Number(row?.count ?? 0);
    },

    async anonymiseInactiveGuests(before, at) {
      return db.transaction(async (tx) => {
        // Stamped with this run's instant, so the bookings step clears only the guests this run anonymised.
        const { guests } = await anonymiseWhere(tx, inactiveGuests, { before, at });
        return guests;
      });
    },

    async countTaskPhotos(doneBefore) {
      const row = await db.get<{ count: number }>(`select count(*)::int as count from (${photosDoneBefore}) found`, { doneBefore });
      return Number(row?.count ?? 0);
    },

    async deleteTaskPhotos(doneBefore) {
      return db.transaction(async (tx) => {
        const removed = await tx.all<{ file_id: string }>(
          `delete from app.task_photos where (task_id, file_id) in (${photosDoneBefore}) returning file_id`,
          { doneBefore },
        );
        if (removed.length === 0) return 0;
        // The files themselves: only task photos, and only those no task lists any more.
        await tx.run(
          `delete from app.private_files f where f.purpose = 'task-photo'
             and f.id in (select (value)::uuid from jsonb_array_elements_text(:fileIds::jsonb) as value)
             and not exists (select 1 from app.task_photos p where p.file_id = f.id)`,
          { fileIds: jsonParam(removed.map((row) => row.file_id)) },
        );
        return removed.length;
      });
    },

    async anonymiseGuest(guestId, at): Promise<GuestAnonymising> {
      if (!isUuid(guestId)) return { status: "missing" };
      return db.transaction(async (tx) => {
        const guest = await tx.get<{ anonymised_at: Date | null }>("select anonymised_at from app.guests where id = :guestId for update", { guestId });
        if (!guest) return { status: "missing" } as const;
        if (guest.anonymised_at) return { status: "already" } as const;
        const busy = await tx.get<{ id: string }>(`select id from app.bookings where guest_id = :guestId and status in (${activeStatuses}) limit 1`, { guestId });
        if (busy) return { status: "active-stay" } as const;
        // Handled requests that became this guest's bookings still hold their name, phone and email until their own retention ends.
        const requests = await tx.run(
          `delete from app.booking_requests where status <> 'waiting' and booking_id in (select id from app.bookings where guest_id = :guestId)`,
          { guestId },
        );
        const { bookings } = await anonymiseWhere(tx, ":guestId::uuid", { guestId, at });
        return { status: "anonymised", bookingsCleared: bookings, requestsDeleted: requests.changes } as const;
      });
    },

    async anonymisedAt(guestId) {
      if (!isUuid(guestId)) return null;
      const row = await db.get<{ anonymised_at: Date | null }>("select anonymised_at from app.guests where id = :guestId", { guestId });
      return row?.anonymised_at ?? null;
    },
  };
}
