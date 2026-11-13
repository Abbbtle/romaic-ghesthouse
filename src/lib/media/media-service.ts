import type { Actor } from "@/lib/kernel/actor";
import type { Clock, IdGenerator } from "@/lib/kernel/ports";
import { done, refusedWith, type ChangeResult } from "@/lib/kernel/result";
import { imageLimits, sniffImage } from "./image";
import type { MediaStore, StoredImage } from "./ports";

export type MediaServiceDependencies = {
  store: MediaStore;
  ids: IdGenerator;
  clock: Clock;
  /** The accounts core's assertCan (src/server wires it), so uploads are checked here too, not only by the caller. */
  access: { assertCan(actor: Actor, permission: "media:manage"): void };
};

/** An image that's just been stored: what content saves as its ImageRef (with the alt text the editor adds). */
export type UploadedImage = { id: string; src: string; width: number; height: number };

// Ids are UUIDs as randomUUID writes them: lower case, so each image has exactly one URL.
const mediaIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Whether a value could be a stored image's id. Anything else can't be one, so it's never looked up. */
export function isMediaId(value: string): boolean {
  return mediaIdPattern.test(value);
}

/** Where the site serves a stored image. */
export function mediaSrc(id: string): string {
  return `/media/${id}`;
}

/**
 * Images the dashboard uploads. Each upload is stored as a new image with a
 * new id and never changes, so its URL can be cached for a year; replacing a
 * photo means uploading another.
 */
export function createMediaService(deps: MediaServiceDependencies) {
  return {
    /**
     * Stores an image after checking it really is a JPEG, PNG or WebP (from
     * its first bytes) within the size limits.
     */
    async upload(actor: Actor, bytes: Uint8Array): Promise<ChangeResult<UploadedImage>> {
      deps.access.assertCan(actor, "media:manage");
      if (bytes.length === 0) return refusedWith("Choose an image to upload.");
      if (bytes.length > imageLimits.maxBytes) return refusedWith("That image is larger than 3.5 MB. Choose a smaller one.");
      const image = sniffImage(bytes);
      if (!image) return refusedWith("Choose a JPEG, PNG or WebP image.");
      if (image.width > imageLimits.maxEdge || image.height > imageLimits.maxEdge) {
        return refusedWith(`That image is more than ${imageLimits.maxEdge} pixels across. Choose a smaller one.`);
      }
      const id = deps.ids.newId();
      await deps.store.save({ id, ...image, bytes, createdAt: deps.clock.now(), createdBy: actor.id });
      return done({ id, src: mediaSrc(id), width: image.width, height: image.height });
    },

    /** A stored image by id, or null when there's none (or the id can't be one). */
    async get(id: string): Promise<StoredImage | null> {
      return isMediaId(id) ? deps.store.find(id) : null;
    },
  };
}

export type MediaService = ReturnType<typeof createMediaService>;
