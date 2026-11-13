import type { Migration } from "../migrate";

/**
 * Tasks and unit statuses (see ../task-store.ts).
 *
 * - app.tasks: housekeeping and maintenance, one unit each. The clean after
 *   a stay links to its booking, and tasks_one_clean_per_stay keeps it to
 *   one however often it's made (at check-out, and by the daily job on the
 *   leaving day). Photos are private files (purpose 'task-photo'), listed in
 *   app.task_photos.
 * - app.unit_status: each unit's housekeeping status; a unit with no row
 *   counts as clean.
 *
 * No money and no guest contact details live here: staff read all of it.
 */
export const tasksMigration: Migration = {
  id: "240-tasks",
  sql: /* sql */ `
    create table app.tasks (
      id uuid primary key,
      kind text not null constraint tasks_kind check (kind in ('housekeeping', 'maintenance')),
      unit_id uuid not null references app.units (id) on delete restrict,
      booking_id uuid references app.bookings (id) on delete set null,
      title text not null constraint tasks_title_length check (length(btrim(title)) between 1 and 120),
      notes text constraint tasks_notes_length check (notes is null or length(notes) <= 4000),
      status text not null constraint tasks_status check (status in ('open', 'in-progress', 'done')),
      priority text not null constraint tasks_priority check (priority in ('normal', 'urgent')),
      assigned_to uuid,
      due_on date not null,
      created_by uuid,
      created_at timestamptz not null,
      started_at timestamptz,
      done_at timestamptz,
      done_by uuid,
      constraint tasks_done check ((status = 'done') = (done_at is not null))
    );
    create unique index tasks_one_clean_per_stay on app.tasks (booking_id) where kind = 'housekeeping' and booking_id is not null;
    create index tasks_open_by_due on app.tasks (due_on) where status <> 'done';
    create index tasks_done_by_time on app.tasks (done_at desc) where status = 'done';

    create table app.task_photos (
      task_id uuid not null references app.tasks (id) on delete cascade,
      -- A private file's id, stored by the private-file service before it's added here (no foreign key, so a
      -- photo can be listed in the same step it's uploaded; a missing file is simply not served).
      file_id uuid not null,
      added_at timestamptz not null default now(),
      primary key (task_id, file_id)
    );

    create table app.unit_status (
      unit_id uuid primary key references app.units (id) on delete cascade,
      status text not null constraint unit_status_status check (status in ('clean', 'dirty', 'inspected', 'out-of-order')),
      note text constraint unit_status_note_length check (note is null or length(note) <= 200),
      updated_at timestamptz not null,
      updated_by uuid
    );

    select app.secure_schema();
  `,
};
