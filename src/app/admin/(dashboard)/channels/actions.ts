"use server";

import { refresh } from "next/cache";
import type { SyncSummary } from "@/lib/channels/channel-service";
import { syncMessage } from "@/lib/channels/sync-message";
import { failedState, formStateOf, savedState, type FormState } from "@/lib/forms/form-state";
import { dashboardAction, dashboardFormAction } from "@/server/admin-actions";
import { channelService } from "@/server/channels";

/*
 * Channels from the dashboard. Every action checks the session and its
 * permission itself, reads each argument as untrusted, and the channel
 * service checks the permission again:
 * - channels:status (owner, admin, sales): "Sync now";
 * - channels:configure (owner, admin): calendar links, channel switches and
 *   feed links, with the password and code given in the last 15 minutes
 *   (step-up), since a changed link can block real dates or hide a stay.
 *   Never sales or staff.
 * A calendar link goes to the service and is never sent back.
 */

const status = { permission: "channels:status" } as const;
const configure = { permission: "channels:configure", stepUp: true } as const;
const reloadMessage = "Reload the page and try again.";

function syncState(summaries: readonly SyncSummary[]): FormState {
  const { message, problem } = syncMessage(summaries);
  return problem && summaries.length === 1 ? failedState(message) : savedState(message);
}

/** "Sync now" on one calendar. */
export const syncCalendar = dashboardAction(async (actor, calendarId: unknown): Promise<FormState> => {
  if (typeof calendarId !== "string") return failedState(reloadMessage);
  const result = await channelService().syncNow(actor, calendarId);
  refresh();
  return result.ok ? syncState(result.summaries) : formStateOf(result);
}, status);

/** "Sync all now": every calendar of a channel that's on. */
export const syncAll = dashboardAction(async (actor): Promise<FormState> => {
  const result = await channelService().syncNow(actor, null);
  refresh();
  return result.ok ? syncState(result.summaries) : formStateOf(result);
}, status);

/** A channel's calendar link for a unit (the unit's id rides along as a hidden field). */
export const addCalendar = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const result = await channelService().addCalendar(actor, Object.fromEntries(formData));
  if (result.ok) refresh();
  return formStateOf(result, "Calendar link saved. Press Sync now to read it.");
}, configure);

/** A new link for a calendar (its id rides along as a hidden field). */
export const changeCalendarUrl = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const id = formData.get("calendarId");
  if (typeof id !== "string") return failedState(reloadMessage);
  const result = await channelService().changeCalendarUrl(actor, id, { url: formData.get("url") });
  if (result.ok) refresh();
  return formStateOf(result, "New calendar link saved. Press Sync now to read it.");
}, configure);

export const removeCalendar = dashboardAction(async (actor, id: unknown): Promise<FormState> => {
  if (typeof id !== "string") return failedState(reloadMessage);
  const result = await channelService().removeCalendar(actor, id);
  if (result.ok) refresh();
  return formStateOf(result, "Calendar removed");
}, configure);

/** Makes a unit's feed link, or replaces it (the old one stops working). */
export const resetFeed = dashboardAction(async (actor, unitId: unknown): Promise<FormState> => {
  if (typeof unitId !== "string") return failedState(reloadMessage);
  const result = await channelService().resetFeed(actor, unitId);
  if (result.ok) refresh();
  return formStateOf(result, "Feed link ready. Paste it into each channel.");
}, configure);

/** A channel's name and switch (its key rides along as a hidden field; the switch posts "on" when on). */
export const updateChannel = dashboardFormAction(async (actor, formData): Promise<FormState> => {
  const key = formData.get("channel");
  if (typeof key !== "string") return failedState(reloadMessage);
  const result = await channelService().updateChannel(actor, key, { name: formData.get("name"), active: formData.get("active") === "on" });
  if (result.ok) refresh();
  return formStateOf(result, "Channel saved");
}, configure);
