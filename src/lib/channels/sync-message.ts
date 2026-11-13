import type { SyncSummary } from "./channel-service";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What "Sync now" says when it's done, in plain words: how many stays came
 * in and how many need someone, or why a calendar couldn't be read.
 * `problem` is true when a calendar couldn't be read.
 */
export function syncMessage(summaries: readonly SyncSummary[]): { message: string; problem: boolean } {
  if (summaries.length === 0) return { message: "There are no calendars to sync: add a channel's calendar link first.", problem: false };
  const failed = summaries.filter((summary) => summary.outcome === "error");
  if (summaries.length === 1 && failed.length === 1) return { message: failed[0]!.error ?? "That calendar couldn't be read. Try again later.", problem: true };

  const added = summaries.reduce((total, summary) => total + summary.added, 0);
  const changed = summaries.reduce((total, summary) => total + summary.changed, 0);
  const removed = summaries.reduce((total, summary) => total + summary.removed, 0);
  const conflicts = summaries.reduce((total, summary) => total + summary.conflicts, 0);
  const parts = [
    added > 0 && count(added, "new stay", "new stays"),
    changed > 0 && count(changed, "change", "changes"),
    removed > 0 && `${count(removed, "stay", "stays")} gone`,
  ].filter((part): part is string => typeof part === "string");
  const what = parts.length > 0 ? parts.join(", ") : "nothing new";
  const synced = summaries.length === 1 ? "Synced" : `Synced ${count(summaries.length - failed.length, "calendar", "calendars")}`;
  const sentences = [`${synced}: ${what}.`];
  if (conflicts > 0) sentences.push(`${count(conflicts, "stay needs", "stays need")} a look: see Needs attention.`);
  if (failed.length > 0) sentences.push(`${count(failed.length, "calendar", "calendars")} couldn't be read: see below.`);
  return { message: sentences.join(" "), problem: failed.length > 0 };
}
