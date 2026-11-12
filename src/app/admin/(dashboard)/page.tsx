import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { adminRoutes, homeFor } from "@/components/admin/admin-routes";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import {
  taskCardOf,
  unitStatusRowOf,
} from "@/components/admin/tasks/task-labels";
import { TaskList } from "@/components/admin/tasks/task-list";
import { UnitStatuses } from "@/components/admin/tasks/unit-statuses";
import {
  StayList,
  type StayActions,
  type StayListKind,
} from "@/components/admin/today/stay-list";
import {
  fullStayRow,
  staffStayRow,
  type StayRow,
} from "@/components/admin/today/today-labels";
import { ButtonLink } from "@/components/ui/button";
import { anySignedInRole, can } from "@/lib/accounts/access";
import { formatDayLong } from "@/lib/format/date-time";
import { businessTimeZone } from "@/lib/format/zoned-time";
import { privateFileMaxBytes } from "@/lib/media/private-files";
import { requireDashboardActor } from "@/server/admin-session";
import { clock } from "@/server/infrastructure";
import { reservationService } from "@/server/stays";
import { taskService } from "@/server/tasks";
import {
  checkInBooking,
  checkOutBooking,
  markNoShow,
} from "./bookings/actions";
import {
  addTaskNote,
  addTaskPhoto,
  finishTask,
  setUnitStatus,
  startTask,
} from "./tasks/actions";

export const metadata: Metadata = { title: "Today" };

type Part = {
  kind: StayListKind;
  title: string;
  stays: StayRow[];
  empty: string;
};

/**
 * The dashboard's home for those who run the house (today:view: the owner,
 * sales and staff): today's date in South Africa, who's arriving, leaving
 * and staying, and the apartments to clean. The owner and sales see each
 * booking whole and can open it; staff see only the guest's name, the
 * unit, the dates and the service notes, built on the server. Admins don't
 * run the house, so they land on their own first section instead.
 */
export default async function TodayPage({ searchParams }: PageProps<"/admin">) {
  const actor = await requireDashboardActor(anySignedInRole);
  const { notice } = await searchParams;
  if (!can(actor, "today:view")) {
    const home = homeFor(actor.role);
    redirect(notice === "not-allowed" ? `${home}?notice=not-allowed` : home);
  }

  const tasks = taskService();
  const [view, toClean] = await Promise.all([
    reservationService().todayView(actor),
    tasks.toClean(actor),
  ]);
  const now = clock.now();
  const today = "full" in view ? view.full.today : view.staff.today;
  const rows = (part: "arriving" | "leaving" | "staying"): StayRow[] => {
    const pick = <T,>(stays: {
      arrivals: T[];
      departures: T[];
      inHouse: T[];
    }) =>
      part === "arriving"
        ? stays.arrivals
        : part === "leaving"
          ? stays.departures
          : stays.inHouse;
    return "full" in view
      ? pick(view.full).map((stay) => fullStayRow(stay, part))
      : pick(view.staff).map((stay) => staffStayRow(stay, part));
  };
  const parts: Part[] = [
    {
      kind: "arriving",
      title: "Arriving",
      stays: rows("arriving"),
      empty: "No one today",
    },
    {
      kind: "leaving",
      title: "Leaving",
      stays: rows("leaving"),
      empty: "No one today",
    },
    {
      kind: "staying",
      title: "In the house",
      stays: rows("staying"),
      empty: "No one staying tonight",
    },
  ];

  const stayActions: StayActions | null = can(actor, "stays:check-in-out")
    ? { checkIn: checkInBooking, checkOut: checkOutBooking, noShow: markNoShow }
    : null;
  const cleans = toClean.tasks.map((task) =>
    taskCardOf(task, today, now, businessTimeZone),
  );
  const cleaning = new Set(toClean.tasks.map((task) => task.unitId));
  const unitsToMention = toClean.units
    .filter(
      (unit) => unit.status === "out-of-order" || !cleaning.has(unit.unitId),
    )
    .map((unit) => unitStatusRowOf(unit, now, businessTimeZone));
  const worksTasks = can(actor, "tasks:work");
  const busy = parts.filter((part) => part.stays.length > 0);
  const hasCleaning = cleans.length > 0 || unitsToMention.length > 0;
  const quiet = [
    ...parts
      .filter((part) => part.stays.length === 0)
      .map((part) => ({ title: part.title, empty: part.empty })),
    ...(hasCleaning
      ? []
      : [{ title: "Apartments to clean", empty: "Nothing to clean" }]),
  ];

  return (
    <>
      <PageHeader
        title="Today"
        description={formatDayLong(today)}
        actions={
          can(actor, "availability:view") && (
            <ButtonLink
              href={adminRoutes.calendar}
              variant="secondary"
              icon={<CalendarDays aria-hidden="true" />}
            >
              Calendar
            </ButtonLink>
          )
        }
      />
      {notice === "not-allowed" && (
        <p
          role="status"
          className="mb-4 rounded-sm border border-hairline bg-surface-2 p-3 text-sm text-fg"
        >
          That part of the dashboard isn&apos;t open to your role. Ask the owner
          if you need it.
        </p>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* What needs doing comes first; the empty parts wait in one short list at the end. */}
        {busy.map((part) => (
          <Panel
            key={part.kind}
            title={`${part.title} (${part.stays.length})`}
            flush
          >
            <StayList
              label={part.title}
              stays={part.stays}
              kind={part.kind}
              actions={stayActions}
            />
          </Panel>
        ))}

        {hasCleaning && (
          <Panel
            title="Apartments to clean"
            flush
            actions={
              worksTasks && (
                <ButtonLink href={adminRoutes.tasks} variant="ghost" size="sm">
                  All tasks
                </ButtonLink>
              )
            }
          >
            {
              <>
                {cleans.length > 0 &&
                  (worksTasks ? (
                    <TaskList
                      compact
                      label="Cleans due"
                      tasks={cleans}
                      actions={{
                        start: startTask,
                        finish: finishTask,
                        addNote: addTaskNote,
                        addPhoto: addTaskPhoto,
                      }}
                      photoMaxBytes={privateFileMaxBytes}
                    />
                  ) : (
                    <ul
                      aria-label="Cleans due"
                      className="divide-y divide-hairline"
                    >
                      {cleans.map((task) => (
                        <li key={task.id} className="px-4 py-3 lg:px-5">
                          {task.title} · {task.statusName}
                        </li>
                      ))}
                    </ul>
                  ))}
                {unitsToMention.length > 0 && (
                  <div
                    className={
                      cleans.length > 0 ? "border-t border-hairline" : undefined
                    }
                  >
                    <UnitStatuses
                      units={unitsToMention}
                      action={can(actor, "rooms:status") ? setUnitStatus : null}
                    />
                  </div>
                )}
              </>
            }
          </Panel>
        )}

        {quiet.length > 0 && (
          <Panel
            title={
              busy.length === 0 && !hasCleaning
                ? "A quiet day"
                : "Nothing else today"
            }
            flush
          >
            <ul className="divide-y divide-hairline">
              {quiet.map((line) => (
                <li
                  key={line.title}
                  className="flex flex-wrap items-baseline gap-x-2 px-4 py-3 text-base lg:px-5"
                >
                  <span className="font-bold text-ink">{line.title}</span>
                  <span className="text-fg-2">{line.empty}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </>
  );
}
