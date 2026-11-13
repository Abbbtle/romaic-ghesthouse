import "server-only";
import type { TaskCreation, TaskStore } from "@/lib/tasks/ports";
import { taskKinds, taskPriorities, taskStatuses, unitStatuses, type Task, type TaskKind, type TaskPriority, type TaskStatus, type UnitStatus, type UnitStatusValue } from "@/lib/tasks/tasks";
import type { Database, SqlExecutor } from "./database";
import { UniqueViolationError } from "./errors";
import { isUuid } from "./uuid";

type TaskRow = {
  id: string;
  kind: string;
  unit_id: string;
  booking_id: string | null;
  title: string;
  notes: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
  due_on: string;
  created_by: string | null;
  created_at: Date;
  started_at: Date | null;
  done_at: Date | null;
  done_by: string | null;
  photo_ids: string | null;
};

type StatusRow = { unit_id: string; status: string; note: string | null; updated_at: Date; updated_by: string | null };

/** Every task column, with its photos (oldest first) as one comma-separated list: arrays don't cross both drivers the same way. */
const selectTasks = `select t.id, t.kind, t.unit_id, t.booking_id, t.title, t.notes, t.status, t.priority, t.assigned_to, t.due_on,
    t.created_by, t.created_at, t.started_at, t.done_at, t.done_by,
    (select string_agg(p.file_id::text, ',' order by p.added_at, p.file_id) from app.task_photos p where p.task_id = t.id) as photo_ids
  from app.tasks t`;

const oneOf = <T extends string>(values: readonly T[], value: string, fallback: T): T => ((values as readonly string[]).includes(value) ? (value as T) : fallback);

function taskOf(row: TaskRow): Task {
  return {
    id: row.id,
    kind: oneOf<TaskKind>(taskKinds, row.kind, "maintenance"),
    unitId: row.unit_id,
    bookingId: row.booking_id,
    title: row.title,
    notes: row.notes,
    status: oneOf<TaskStatus>(taskStatuses, row.status, "open"),
    priority: oneOf<TaskPriority>(taskPriorities, row.priority, "normal"),
    assignedTo: row.assigned_to,
    dueOn: row.due_on,
    createdBy: row.created_by,
    createdAt: row.created_at,
    startedAt: row.started_at,
    doneAt: row.done_at,
    doneBy: row.done_by,
    photoIds: row.photo_ids ? row.photo_ids.split(",") : [],
  };
}

const statusOf = (row: StatusRow): UnitStatus => ({
  unitId: row.unit_id,
  status: oneOf<UnitStatusValue>(unitStatuses, row.status, "clean"),
  note: row.note,
  updatedAt: row.updated_at,
  updatedBy: row.updated_by,
});

async function upsertStatus(sql: SqlExecutor, status: UnitStatus): Promise<boolean> {
  const { changes } = await sql.run(
    `insert into app.unit_status (unit_id, status, note, updated_at, updated_by)
     select :unitId, :status, :note, :updatedAt, :updatedBy where exists (select 1 from app.units where id = :unitId)
     on conflict (unit_id) do update set status = excluded.status, note = excluded.note, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    { unitId: status.unitId, status: status.status, note: status.note, updatedAt: status.updatedAt ?? new Date(0), updatedBy: status.updatedBy },
  );
  return changes === 1;
}

/** Inserts a task; "duplicate" when its stay already has a clean, "unit-missing" when the unit doesn't exist. */
async function insertTask(sql: SqlExecutor, task: Task): Promise<TaskCreation> {
  try {
    const { changes } = await sql.run(
      `insert into app.tasks (id, kind, unit_id, booking_id, title, notes, status, priority, assigned_to, due_on, created_by, created_at, started_at, done_at, done_by)
       select :id, :kind, :unitId, :bookingId, :title, :notes, :status, :priority, :assignedTo, :dueOn::date, :createdBy, :createdAt, :startedAt, :doneAt, :doneBy
       where exists (select 1 from app.units where id = :unitId)
       on conflict (booking_id) where kind = 'housekeeping' and booking_id is not null do nothing`,
      {
        id: task.id,
        kind: task.kind,
        unitId: task.unitId,
        bookingId: task.bookingId,
        title: task.title,
        notes: task.notes,
        status: task.status,
        priority: task.priority,
        assignedTo: task.assignedTo,
        dueOn: task.dueOn,
        createdBy: task.createdBy,
        createdAt: task.createdAt,
        startedAt: task.startedAt,
        doneAt: task.doneAt,
        doneBy: task.doneBy,
      },
    );
    if (changes === 1) return { status: "created" };
    const unit = await sql.get<{ id: string }>("select id from app.units where id = :unitId", { unitId: task.unitId });
    return unit ? { status: "duplicate" } : { status: "unit-missing" };
  } catch (error) {
    if (error instanceof UniqueViolationError && error.constraint === "tasks_one_clean_per_stay") return { status: "duplicate" };
    throw error;
  }
}

/** Tasks and unit statuses in Postgres (./migrations/240-tasks.ts). */
export function createPostgresTaskStore(db: Database): TaskStore {
  return {
    async tasks(filter) {
      const done = filter.statuses?.length === 1 && filter.statuses[0] === "done";
      const rows = await db.all<TaskRow>(
        `${selectTasks}
         where (:anyStatus or t.status = any(:statuses::text[]))
           and (:assignedTo::uuid is null or t.assigned_to = :assignedTo::uuid)
           and (:doneSince::timestamptz is null or t.done_at >= :doneSince::timestamptz)
         order by ${done ? "t.done_at desc" : "t.due_on, case when t.priority = 'urgent' then 0 else 1 end, t.created_at"}
         limit :limit`,
        {
          anyStatus: !filter.statuses,
          statuses: `{${(filter.statuses ?? []).join(",")}}`,
          assignedTo: filter.assignedTo && isUuid(filter.assignedTo) ? filter.assignedTo : null,
          doneSince: filter.doneSince ?? null,
          limit: filter.limit,
        },
      );
      if (filter.assignedTo && !isUuid(filter.assignedTo)) return [];
      return rows.map(taskOf);
    },

    async task(id) {
      if (!isUuid(id)) return null;
      const row = await db.get<TaskRow>(`${selectTasks} where t.id = :id`, { id });
      return row ? taskOf(row) : null;
    },

    async create(task) {
      if (!isUuid(task.unitId)) return { status: "unit-missing" };
      return insertTask(db, task);
    },

    async checkOut(unitStatus, clean) {
      if (!isUuid(unitStatus.unitId)) return { status: "unit-missing" };
      return db.transaction(async (tx) => {
        if (!(await upsertStatus(tx, unitStatus))) return { status: "unit-missing" } as const;
        return insertTask(tx, clean);
      });
    },

    async start(id, at, assignTo) {
      if (!isUuid(id)) return false;
      const { changes } = await db.run(
        "update app.tasks set status = 'in-progress', started_at = :at, assigned_to = coalesce(assigned_to, :assignTo::uuid) where id = :id and status = 'open'",
        { id, at, assignTo: isUuid(assignTo) ? assignTo : null },
      );
      return changes === 1;
    },

    async finish({ id, at, by, note, unitStatus }) {
      if (!isUuid(id)) return false;
      return db.transaction(async (tx) => {
        const { changes } = await tx.run(
          `update app.tasks set status = 'done', done_at = :at, done_by = :by,
             notes = case when :note::text is null then notes when notes is null then :note::text else notes || chr(10) || :note::text end
           where id = :id and status <> 'done'`,
          { id, at, by: isUuid(by) ? by : null, note },
        );
        if (changes !== 1) return false;
        if (unitStatus) await upsertStatus(tx, unitStatus);
        return true;
      });
    },

    async addNote(id, note) {
      if (!isUuid(id)) return false;
      const { changes } = await db.run(
        "update app.tasks set notes = case when notes is null then :note::text else notes || chr(10) || :note::text end where id = :id and status <> 'done'",
        { id, note },
      );
      return changes === 1;
    },

    async addPhoto(id, fileId, max) {
      if (!isUuid(id) || !isUuid(fileId)) return false;
      return db.transaction(async (tx) => {
        const task = await tx.get<{ status: string }>("select status from app.tasks where id = :id for update", { id });
        if (!task || task.status === "done") return false;
        const count = await tx.get<{ count: number }>("select count(*)::int as count from app.task_photos where task_id = :id", { id });
        if ((count?.count ?? 0) >= max) return false;
        const { changes } = await tx.run(
          "insert into app.task_photos (task_id, file_id, added_at) values (:id, :fileId, clock_timestamp()) on conflict do nothing",
          { id, fileId },
        );
        return changes === 1;
      });
    },

    async change(id, fields) {
      if (!isUuid(id)) return false;
      const { changes } = await db.run(
        "update app.tasks set priority = :priority, due_on = :dueOn::date, assigned_to = :assignedTo::uuid where id = :id and status <> 'done'",
        { id, priority: fields.priority, dueOn: fields.dueOn, assignedTo: fields.assignedTo && isUuid(fields.assignedTo) ? fields.assignedTo : null },
      );
      return changes === 1;
    },

    async remove(id) {
      if (!isUuid(id)) return false;
      const { changes } = await db.run("delete from app.tasks where id = :id", { id });
      return changes === 1;
    },

    async unitStatuses() {
      return (await db.all<StatusRow>("select unit_id, status, note, updated_at, updated_by from app.unit_status order by unit_id")).map(statusOf);
    },

    async setUnitStatus(status) {
      if (!isUuid(status.unitId)) return false;
      return upsertStatus(db, status);
    },
  };
}
