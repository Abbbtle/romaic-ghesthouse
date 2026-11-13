"use server";

import { refresh } from "next/cache";
import { failedState, formStateOf, invalidState, type FormState } from "@/lib/forms/form-state";
import { privateFileMaxBytes } from "@/lib/media/private-files";
import { dashboardAction, dashboardFormAction } from "@/server/admin-actions";
import { privateFileService } from "@/server/media";
import { taskService } from "@/server/tasks";

/*
 * Tasks and apartment statuses from the dashboard (Tasks and Today). Every
 * action checks the session and its permission itself, reads each argument
 * as untrusted, and the tasks service checks the permission again.
 */

const reloadMessage = "Reload the page and try again.";

/** The task a form is about, from its hidden taskId field. */
function taskIdOf(formData: FormData): string | null {
  const id = formData.get("taskId");
  return typeof id === "string" && id.length > 0 ? id : null;
}

export const createTask = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const result = await taskService().create(actor, Object.fromEntries(formData));
  if (result.ok) refresh();
  return formStateOf(result, "Task added");
}, { permission: "tasks:manage" });

export const reportProblem = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const result = await taskService().reportProblem(actor, Object.fromEntries(formData));
  if (result.ok) refresh();
  return formStateOf(result, "Problem reported. It's on the open list.");
}, { permission: "tasks:work" });

export const startTask = dashboardAction(async (actor, id: unknown): Promise<FormState> => {
  if (typeof id !== "string") return failedState(reloadMessage);
  const result = await taskService().start(actor, id);
  if (result.ok) refresh();
  return formStateOf(result, "Started");
}, { permission: "tasks:work" });

export const finishTask = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const id = taskIdOf(formData);
  if (!id) return failedState(reloadMessage);
  const result = await taskService().finish(actor, id, Object.fromEntries(formData));
  if (result.ok) refresh();
  return formStateOf(result, "Marked done");
}, { permission: "tasks:work" });

export const addTaskNote = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const id = taskIdOf(formData);
  if (!id) return failedState(reloadMessage);
  const result = await taskService().addNote(actor, id, Object.fromEntries(formData));
  if (result.ok) refresh();
  return formStateOf(result, "Note added");
}, { permission: "tasks:work" });

/**
 * A photo for a task (resized in the browser first): stored as a private
 * file (purpose "task-photo", served only to roles that work tasks), then
 * listed on the task. The size is checked before the file is read.
 */
export const addTaskPhoto = dashboardAction(async (actor, data: unknown): Promise<FormState> => {
  if (!(data instanceof FormData)) return failedState(reloadMessage);
  const id = taskIdOf(data);
  const photo = data.get("photo");
  if (!id) return failedState(reloadMessage);
  if (!(photo instanceof File) || photo.size === 0) return failedState("Choose a photo to add.");
  if (photo.size > privateFileMaxBytes) return failedState("That photo is larger than 3.5 MB. Choose a smaller one.");
  const room = await taskService().checkPhotoRoom(actor, id);
  if (!room.ok) return formStateOf(room, "");
  const stored = await privateFileService().store(actor, { purpose: "task-photo", fileName: photo.name || "photo.jpg", bytes: new Uint8Array(await photo.arrayBuffer()) });
  if (!stored.ok) return invalidState(stored.errors);
  const result = await taskService().addPhoto(actor, id, stored.id);
  if (result.ok) refresh();
  return formStateOf(result, "Photo added");
}, { permission: "tasks:work" });

export const changeTask = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const id = taskIdOf(formData);
  if (!id) return failedState(reloadMessage);
  const result = await taskService().change(actor, id, Object.fromEntries(formData));
  if (result.ok) refresh();
  return formStateOf(result, "Task saved");
}, { permission: "tasks:manage" });

export const removeTask = dashboardAction(async (actor, id: unknown): Promise<FormState> => {
  if (typeof id !== "string") return failedState(reloadMessage);
  const result = await taskService().remove(actor, id);
  if (result.ok) refresh();
  return formStateOf(result, "Task removed");
}, { permission: "tasks:manage" });

export const setUnitStatus = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const result = await taskService().setUnitStatus(actor, Object.fromEntries(formData));
  if (result.ok) refresh();
  return formStateOf(result, "Apartment status saved");
}, { permission: "rooms:status" });
