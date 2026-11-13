/**
 * Photos are made small enough to upload in the browser, before they leave
 * the phone (SPEC §5.3): at most 2,000 px on the long edge, turned the way
 * the camera meant (createImageBitmap reads the Exif orientation), and saved
 * as a JPEG at about 82% quality, which keeps a phone photo to a few hundred
 * kilobytes. An image with see-through parts, such as a logo, is kept as a
 * PNG so they stay see-through. The server checks the result again.
 */

/** The longest edge an uploaded image is made to fit, and the smaller ones tried when that's still too heavy. */
export const imageEdges = [2000, 1600, 1280] as const;

export const jpegQuality = 0.82;

/** The types the file picker offers. A phone's HEIC photo is handed over as a JPEG when only these are accepted. */
export const acceptedImageTypes = "image/jpeg,image/png,image/webp";

export type PreparedImage = { file: File; width: number; height: number };

export type Preparation = { ok: true; image: PreparedImage } | { ok: false; problem: string };

export const unreadableImage = "We couldn't open that file. Choose a JPG, PNG or WebP photo.";

export const oversizedImage = "That photo is too big to upload, even made smaller. Choose another one.";

/** The size to draw an image at so its long edge is at most `edge`; a smaller image keeps its size. */
export function fittedSize(width: number, height: number, edge: number): { width: number; height: number } {
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Whether a file of this type can have see-through parts worth keeping. JPEGs can't. */
export function mayBeTransparent(type: string): boolean {
  return type !== "image/jpeg";
}

/** Whether any pixel lets the background through, from RGBA bytes (canvas ImageData). */
export function hasTransparentPixels(rgba: Uint8ClampedArray): boolean {
  for (let alpha = 3; alpha < rgba.length; alpha += 4) if ((rgba[alpha] ?? 255) < 255) return true;
  return false;
}

/**
 * The image ready to upload, or what's wrong with it. Browser only: it
 * draws the image on a canvas.
 */
export async function prepareImage(file: File, maxBytes: number): Promise<Preparation> {
  if (file.type === "image/svg+xml" || (file.type !== "" && !file.type.startsWith("image/"))) return { ok: false, problem: unreadableImage };
  const bitmap = await decode(file);
  if (!bitmap) return { ok: false, problem: unreadableImage };
  try {
    const transparent = mayBeTransparent(file.type) && seesThrough(bitmap);
    const type = transparent ? "image/png" : "image/jpeg";
    for (const edge of imageEdges) {
      const size = fittedSize(bitmap.width, bitmap.height, edge);
      const blob = await draw(bitmap, size, type);
      if (!blob) return { ok: false, problem: unreadableImage };
      if (blob.size <= maxBytes) {
        const file = new File([blob], transparent ? "image.png" : "photo.jpg", { type });
        return { ok: true, image: { file, ...size } };
      }
    }
    return { ok: false, problem: oversizedImage };
  } finally {
    bitmap.close();
  }
}

async function decode(file: File): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      // Older Safari refuses the options object; turning the photo is its default anyway.
      return await createImageBitmap(file);
    } catch {
      return null;
    }
  }
}

/** Whether a small copy of the image has any see-through pixels: enough to tell a logo from a photo. */
function seesThrough(bitmap: ImageBitmap): boolean {
  const size = fittedSize(bitmap.width, bitmap.height, 256);
  const canvas = canvasOf(size);
  const context = canvas.getContext("2d");
  if (!context) return false;
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  return hasTransparentPixels(context.getImageData(0, 0, size.width, size.height).data);
}

function draw(bitmap: ImageBitmap, size: { width: number; height: number }, type: "image/jpeg" | "image/png"): Promise<Blob | null> {
  const canvas = canvasOf(size);
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
  if (type === "image/jpeg") {
    // A JPEG has no see-through parts: anything faintly see-through goes on white, not black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
  }
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  return new Promise((resolve) => canvas.toBlob(resolve, type, type === "image/jpeg" ? jpegQuality : undefined));
}

function canvasOf({ width, height }: { width: number; height: number }): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** "420 KB" or "1.2 MB", for saying how small an image was made. */
export function sizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
