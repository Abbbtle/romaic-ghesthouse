import "server-only";
import { createPostgresAccountStores } from "@/adapters/postgres/account-stores";
import { createPostgresInventoryStore } from "@/adapters/postgres/inventory-store";
import { createPostgresReservationStore } from "@/adapters/postgres/reservation-store";
import { createPostgresTaskStore } from "@/adapters/postgres/task-store";
import { assertCan, can } from "@/lib/accounts/access";
import { businessTimeZone } from "@/lib/format/zoned-time";
import type { Booking } from "@/lib/reservations/reservations";
import { createTaskService, type Assignee, type Departure, type TaskService } from "@/lib/tasks/task-service";
import { auditRecorder } from "./audit";
import { clock, database, ids } from "./infrastructure";

/**
 * The tasks core as the site uses it: tasks and unit statuses in Postgres,
 * units from the inventory, the people a task can be given to from the
 * team, and departures from the reservations, with every change in the
 * audit log. Made on first use and kept per module.
 */

/** Active team members whose role works tasks (owner, sales, staff), by name. Admins don't. */
async function people(): Promise<Assignee[]> {
  const members = await createPostgresAccountStores(database()).accounts.list();
  return members
    .filter((member) => member.status === "active" && can({ role: member.role }, "tasks:work"))
    .map((member) => ({ id: member.id, name: member.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Stays leaving on `day`, confirmed or checked in, with the guest's name for the clean's title. */
async function departures(day: string): Promise<Departure[]> {
  const around = await createPostgresReservationStore(database()).bookingsAround(day);
  return around.filter((booking) => booking.stay.leave === day).map((booking) => ({ bookingId: booking.id, unitId: booking.unitId, guestName: booking.guest.name }));
}

let service: TaskService | null = null;

export function taskService(): TaskService {
  service ??= createTaskService({
    store: createPostgresTaskStore(database()),
    units: () => createPostgresInventoryStore(database()).units(),
    people,
    departures,
    clock,
    ids,
    audit: auditRecorder(),
    access: { can, assertCan },
    timeZone: businessTimeZone,
  });
  return service;
}

/** After a guest checks out (the reservations service calls it): their unit needs cleaning, and its clean is added. */
export async function afterCheckOut(booking: Booking): Promise<void> {
  const stored = await createPostgresReservationStore(database()).booking(booking.id);
  await taskService().afterCheckOut({ bookingId: booking.id, unitId: booking.unitId, guestName: stored?.guest.name ?? "" });
}

/** The daily job: the clean for every stay leaving today. */
export function generateHousekeeping(): Promise<{ created: number }> {
  return taskService().generateHousekeeping();
}
