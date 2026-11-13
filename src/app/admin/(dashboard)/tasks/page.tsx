import type { Metadata } from "next";
import { adminRoutes } from "@/components/admin/admin-routes";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { Tabs } from "@/components/admin/tabs";
import { taskCardOf, unitStatusRowOf } from "@/components/admin/tasks/task-labels";
import { TaskList } from "@/components/admin/tasks/task-list";
import { NewTask, ReportProblem } from "@/components/admin/tasks/task-sheets";
import { UnitStatuses } from "@/components/admin/tasks/unit-statuses";
import { can } from "@/lib/accounts/access";
import { businessTimeZone } from "@/lib/format/zoned-time";
import { privateFileMaxBytes } from "@/lib/media/private-files";
import { doneListDays, taskViews, type TaskBoardView } from "@/lib/tasks/task-service";
import { requireDashboardActor } from "@/server/admin-session";
import { clock } from "@/server/infrastructure";
import { taskService } from "@/server/tasks";
import { addTaskNote, addTaskPhoto, changeTask, createTask, finishTask, removeTask, reportProblem, setUnitStatus, startTask } from "./actions";

export const metadata: Metadata = { title: "Tasks" };

const hrefs: Record<TaskBoardView, string> = { mine: `${adminRoutes.tasks}?view=mine`, open: `${adminRoutes.tasks}?view=open`, done: `${adminRoutes.tasks}?view=done` };

const tabs = [
  { href: hrefs.mine, label: "Mine" },
  { href: hrefs.open, label: "Open" },
  { href: hrefs.done, label: "Done" },
] as const;

const panelTitles: Record<TaskBoardView, string> = { mine: "Your tasks", open: "Open tasks", done: `Done in the last ${doneListDays} days` };

/**
 * Housekeeping and maintenance for the owner, sales and staff (tasks:work;
 * never admin). Everyone can take on, finish, note and photograph tasks and
 * report problems; the owner and sales (tasks:manage) also set, give out,
 * change and remove them. Room statuses sit beside the list
 * (rooms:status). Tasks carry no money or guest contact details, so staff
 * see them whole.
 */
export default async function TasksPage({ searchParams }: PageProps<"/admin/tasks">) {
  const actor = await requireDashboardActor({ permission: "tasks:work" });
  const { view: asked } = await searchParams;
  const canManage = can(actor, "tasks:manage");
  const view: TaskBoardView = (taskViews as readonly unknown[]).includes(asked) ? (asked as TaskBoardView) : canManage ? "open" : "mine";
  const service = taskService();
  const [board, statuses] = await Promise.all([service.board(actor, view), can(actor, "rooms:status") ? service.unitStatuses(actor) : Promise.resolve(null)]);
  const now = clock.now();
  const cards = board.tasks.map((task) => taskCardOf(task, board.today, now, businessTimeZone));
  const actions = { start: startTask, finish: finishTask, addNote: addTaskNote, addPhoto: addTaskPhoto, ...(canManage ? { change: changeTask, remove: removeTask } : {}) };

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Cleaning and repairs for each room: who's on what, and what's done."
        actions={
          <div className="flex flex-wrap gap-3">
            <ReportProblem action={reportProblem} units={board.units} />
            {canManage && <NewTask action={createTask} units={board.units} people={board.people} today={board.today} />}
          </div>
        }
      />
      <Tabs label="Tasks" items={tabs} current={hrefs[view]} className="mb-4" />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel title={panelTitles[view]} flush>
          {cards.length > 0 ? (
            <TaskList label={panelTitles[view]} tasks={cards} actions={actions} people={canManage ? board.people : undefined} photoMaxBytes={privateFileMaxBytes} />
          ) : (
            <EmptyState frame="none" title={emptyTitles[view]} className="p-4 lg:p-5">
              {emptyText(view, canManage)}
            </EmptyState>
          )}
        </Panel>
        {statuses && (
          <Panel title="Rooms" description="Set by whoever last cleaned or checked them." flush>
            {statuses.length > 0 ? (
              <UnitStatuses units={statuses.map((unit) => unitStatusRowOf(unit, now, businessTimeZone))} action={setUnitStatus} />
            ) : (
              <p className="p-4 text-sm text-fg-2 lg:p-5">No rooms yet. The owner adds them under Rooms.</p>
            )}
          </Panel>
        )}
      </div>
    </>
  );
}

const emptyTitles: Record<TaskBoardView, string> = { mine: "Nothing on your list", open: "No open tasks", done: "Nothing done yet" };

function emptyText(view: TaskBoardView, canManage: boolean): string {
  switch (view) {
    case "mine":
      return "Tasks given to you, and ones you start, show up here. Look under Open for jobs nobody has taken yet.";
    case "open":
      return canManage
        ? "When a guest checks out, their room's clean appears here. Add other jobs with New task."
        : "When a guest checks out, their room's clean appears here. Spot something broken? Report a problem.";
    case "done":
      return `Finished tasks from the last ${doneListDays} days show up here.`;
  }
}
