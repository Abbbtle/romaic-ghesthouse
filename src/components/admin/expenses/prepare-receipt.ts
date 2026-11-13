import { prepareImage } from "../content/prepare-image";

/** What the receipt pickers offer: a PDF, or a photo. */
export const acceptedReceiptTypes = "application/pdf,image/jpeg,image/png,image/webp";

/**
 * A receipt ready to upload: a photo made small enough in the browser
 * first (see ../content/prepare-image.ts), keeping its name; a PDF as it
 * is, if it isn't too big. The server checks the bytes again.
 */
export async function prepareReceipt(file: File, maxBytes: number): Promise<{ ok: true; file: File } | { ok: false; problem: string }> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return file.size <= maxBytes ? { ok: true, file } : { ok: false, problem: "That PDF is larger than 3.5 MB. Choose a smaller one, or take a photo of the receipt." };
  }
  const prepared = await prepareImage(file, maxBytes);
  if (!prepared.ok) return prepared;
  const stem = file.name.replace(/\.[^.]*$/, "") || "receipt";
  const extension = prepared.image.file.type === "image/png" ? ".png" : ".jpg";
  return { ok: true, file: new File([prepared.image.file], `${stem}${extension}`, { type: prepared.image.file.type }) };
}

/** Puts a prepared file in a file input in place of the one chosen, so the form sends the smaller one. False where the browser can't. */
export function replaceChosenFile(input: HTMLInputElement, file: File): boolean {
  try {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    return true;
  } catch {
    return false;
  }
}
