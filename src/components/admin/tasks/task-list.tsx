"use client";

import type { Assignee } from "@/lib/tasks/task-service";
import { TaskCard, type TaskCardActions } from "./task-card";
import type { TaskCardData } from "./task-labels";

/** Tasks as cards separated by hairlines, edge to edge in a flush Panel. */
export function TaskList({
  label,
  tasks,
  actions,
  people,
  photoMaxBytes,
  compact = false,
}: {
  label: string;
  tasks: readonly TaskCardData[];
  actions: TaskCardActions;
  people?: readonly Assignee[];
  photoMaxBytes: number;
  /** Only the next step and Add photo, as on Today; the Tasks page has the rest. */
  compact?: boolean;
}) {
  return (
    <ul aria-label={label} className="divide-y divide-hairline">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} actions={actions} people={people} photoMaxBytes={photoMaxBytes} compact={compact} />
      ))}
    </ul>
  );
}
