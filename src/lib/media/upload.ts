import type { Parsed } from "@/lib/forms/parse";
import { formErrorKey } from "@/lib/kernel/result";
import { imageLimits } from "./image";

/**
 * The bytes of an uploaded image from a form field, for a server action to
 * pass to the media service. The size is checked before the file is read
 * into memory, so an oversized upload costs nothing; the media service then
 * checks what the bytes really are.
 */
export async function readImageFile(value: FormDataEntryValue | null): Promise<Parsed<Uint8Array>> {
  if (typeof value === "string" || value === null || value.size === 0) {
    return { ok: false, errors: { [formErrorKey]: "Choose an image to upload." } };
  }
  if (value.size > imageLimits.maxBytes) {
    return { ok: false, errors: { [formErrorKey]: "That image is larger than 3.5 MB. Choose a smaller one." } };
  }
  return { ok: true, value: new Uint8Array(await value.arrayBuffer()) };
}
