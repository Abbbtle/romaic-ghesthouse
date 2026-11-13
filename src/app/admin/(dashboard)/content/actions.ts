"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { contentEditorHref } from "@/components/admin/content/content-sections";
import type { UploadImageResult } from "@/components/admin/content/image-field";
import { can, type DashboardRequirement } from "@/lib/accounts/access";
import { isSectionKey, sectionPermissions } from "@/lib/content/schema";
import { unknownSectionMessage } from "@/lib/content/service";
import { failedState, formStateOf, type FormState } from "@/lib/forms/form-state";
import type { Actor } from "@/lib/kernel/actor";
import { refusedWith } from "@/lib/kernel/result";
import { dashboardAction } from "@/server/admin-actions";
import { contentService } from "@/server/content";
import { uploadImage } from "@/server/media";

/*
 * Saving and restoring the site's content from the dashboard. Every argument
 * arrives from the browser, so each is taken as unknown. Who may change a
 * section depends on the section (the contact details are the owner's
 * alone), so each action checks the section's permission itself, and the
 * content service checks it again before it saves.
 */

const notAllowedMessage = "Your role doesn't include this part of the website. Ask the owner if it needs changing.";

/** Editing any part of the website; each section's own permission is checked once the section is known. */
const editContent: DashboardRequirement = { permission: "content:edit" };

/** Uploading a photo for the site; the media service checks it again. */
const managePhotos: DashboardRequirement = { permission: "media:manage" };

/** Whether `actor` may change section `key`: a known section, and their role holds its permission. */
function mayEdit(actor: Actor, key: string): boolean {
  return isSectionKey(key) && can(actor, sectionPermissions[key]);
}

/** Saves a section over the revision its editor started from, then refreshes the page so the editor shows what was stored. */
export const saveContentSection = dashboardAction(async (actor, section: unknown, revision: unknown, content: unknown): Promise<FormState> => {
  const key = typeof section === "string" ? section : "";
  if (!isSectionKey(key)) return failedState(unknownSectionMessage);
  if (!mayEdit(actor, key)) return failedState(notAllowedMessage);
  const expected = typeof revision === "number" ? revision : Number.NaN;
  const result = await contentService().saveSection(actor, key, content, expected);
  if (result.ok) refresh();
  return formStateOf(result, "Saved");
}, editContent);

/**
 * Puts an earlier version of a section back, as a new revision over the one
 * the person was looking at, then opens the section's editor on it.
 */
export const restoreContentRevision = dashboardAction(
  async (actor, section: unknown, revision: unknown, expectedRevision: unknown): Promise<FormState> => {
    const key = typeof section === "string" ? section : "";
    if (!isSectionKey(key)) return failedState(unknownSectionMessage);
    if (!mayEdit(actor, key)) return failedState(notAllowedMessage);
    const version = typeof revision === "number" ? revision : Number.NaN;
    const expected = typeof expectedRevision === "number" ? expectedRevision : Number.NaN;
    const result = await contentService().restoreRevision(actor, key, version, expected);
    if (!result.ok) return formStateOf(result);
    redirect(`${contentEditorHref(key)}?restored=${version}`);
  },
  editContent,
);

/**
 * Stores a photo an editor prepared (the "image" field of `data`), for the
 * editor to save as part of its section. Nothing on the site changes until
 * the section is saved.
 */
export const uploadContentImage = dashboardAction(async (actor, data: unknown): Promise<UploadImageResult> => {
  if (!(data instanceof FormData)) return refusedWith("Choose a photo to upload.");
  const uploaded = await uploadImage(actor, data.get("image"));
  return uploaded.ok ? { ok: true, src: uploaded.src, width: uploaded.width, height: uploaded.height } : uploaded;
}, managePhotos);
