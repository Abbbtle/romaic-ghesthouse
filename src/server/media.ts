import "server-only";
import { createPostgresMediaStore, createPostgresPrivateFileStore } from "@/adapters/postgres/media-store";
import type { Actor } from "@/lib/kernel/actor";
import type { ChangeResult } from "@/lib/kernel/result";
import { createMediaService, type MediaService, type UploadedImage } from "@/lib/media/media-service";
import type { StoredImage } from "@/lib/media/ports";
import { assertCan, can } from "@/lib/accounts/access";
import { createPrivateFileService, type PrivateFileService, type StoredPrivateFile } from "@/lib/media/private-files";
import { readImageFile } from "@/lib/media/upload";
import { auditRecorder } from "./audit";
import { clock, database, ids } from "./infrastructure";

let service: MediaService | null = null;
let privateService: PrivateFileService | null = null;

/** The media service over the app's database. Kept per module, like the account services (see ./accounts.ts). */
export function mediaService(): MediaService {
  service ??= createMediaService({ store: createPostgresMediaStore(database()), ids, clock, access: { assertCan } });
  return service;
}

/**
 * Stores the image a dashboard form uploaded (a File field's value). Server
 * actions call this after checking the session. The size is checked before
 * the file is read, then the service checks what the bytes really are.
 */
export async function uploadImage(actor: Actor, file: FormDataEntryValue | null): Promise<ChangeResult<UploadedImage>> {
  const read = await readImageFile(file);
  return read.ok ? mediaService().upload(actor, read.value) : read;
}

/**
 * The response for GET /media/<id>. An image never changes once stored (a
 * replacement gets a new id), so browsers and Vercel's CDN may keep it for a
 * year. nosniff stops a browser treating the bytes as anything but the
 * image type the server checked them to be.
 */
export function imageResponse(image: StoredImage | null): Response {
  if (!image) {
    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return new Response(image.bytes.slice(), {
    headers: {
      "Content-Type": image.contentType,
      "Content-Length": String(image.byteSize),
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      ETag: `"${image.sha256}"`,
    },
  });
}

/** Private files (receipts, proof of submission, task photos, ID documents), opened only after a permission check. */
export function privateFileService(): PrivateFileService {
  privateService ??= createPrivateFileService({ store: createPostgresPrivateFileStore(database()), access: { can, assertCan }, ids, clock, audit: auditRecorder() });
  return privateService;
}

/**
 * The response for GET /admin/files/<id>, for someone already allowed to open
 * it: always a download (never shown as a page), never kept by any cache, and
 * sandboxed by its own CSP in case a browser ignores the download hint.
 */
export function privateFileResponse(file: StoredPrivateFile | null): Response {
  const noStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (!file) return new Response("Not found", { status: 404, headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(file.bytes.slice(), {
    headers: {
      ...noStore,
      "Content-Type": file.contentType,
      "Content-Length": String(file.byteSize),
      "Content-Disposition": `attachment; filename="${file.fileName}"`,
      "Content-Security-Policy": "sandbox; default-src 'none'",
    },
  });
}
