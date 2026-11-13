import { z } from "zod";
import { optionalText, requiredText } from "@/lib/forms/fields";
import { isIsoDate } from "@/lib/format/zoned-time";
import { taskKinds, taskPriorities, unitStatuses } from "./tasks";

/** What the tasks forms send, read again on the server whatever the browser checked. */

export const taskFieldLimits = { titleMax: 120, notesMax: 2000, noteMax: 500, unitNoteMax: 200 } as const;

const unitId = z.string("Choose the room.").trim().min(1, "Choose the room.").max(64, "Choose the room.");
const title = requiredText({
  max: taskFieldLimits.titleMax,
  required: "Say what needs doing, like Fix the dripping tap.",
  tooLong: `Keep the title under ${taskFieldLimits.titleMax} characters.`,
});
const notes = optionalText({ max: taskFieldLimits.notesMax, tooLong: `Keep the notes under ${taskFieldLimits.notesMax} characters.` });
const priority = z.enum(taskPriorities, "Choose how urgent it is.");
const dueOn = z.string("Choose the day it's due.").refine(isIsoDate, "Choose the day it's due.");
const assignee = optionalText({ max: 64, tooLong: "Choose who it's for again." });

/** A task the owner or sales sets (tasks:manage). */
export const newTaskSchema = z.object({
  kind: z.enum(taskKinds, "Choose the kind of task."),
  unitId,
  title,
  notes,
  priority,
  dueOn,
  assignedTo: assignee,
});

export type NewTaskDraft = z.output<typeof newTaskSchema>;

/** A problem anyone who works tasks reports (tasks:work): it becomes a maintenance task due today. */
export const problemReportSchema = z.object({ unitId, title, notes, priority });

export type ProblemReportDraft = z.output<typeof problemReportSchema>;

/** A note added to a task, or left on finishing it. */
export const taskNoteSchema = z.object({
  note: optionalText({ max: taskFieldLimits.noteMax, tooLong: `Keep the note under ${taskFieldLimits.noteMax} characters.` }),
});

/** Who a task is with, its urgency and when it's due (tasks:manage). */
export const taskChangeSchema = z.object({ priority, dueOn, assignedTo: assignee });

export const unitStatusSchema = z.object({
  unitId,
  status: z.enum(unitStatuses, "Choose the room's status."),
  note: optionalText({ max: taskFieldLimits.unitNoteMax, tooLong: `Keep the note under ${taskFieldLimits.unitNoteMax} characters.` }),
});
