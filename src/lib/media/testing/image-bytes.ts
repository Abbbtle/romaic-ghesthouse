/**
 * Smallest-possible image files for tests: just the headers the sniffers
 * read, built here so tests don't depend on any photo in the repository.
 */

const bigEndian = (value: number, bytes: number) => Array.from({ length: bytes }, (_, index) => Math.floor(value / 256 ** (bytes - 1 - index)) % 256);

/** A PNG: the signature and an IHDR chunk naming its size. */
export function pngBytes(width: number, height: number): Uint8Array<ArrayBuffer> {
  const ihdr = [...bigEndian(width, 4), ...bigEndian(height, 4), 8, 2, 0, 0, 0];
  return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...bigEndian(13, 4), 0x49, 0x48, 0x44, 0x52, ...ihdr, 0, 0, 0, 0]);
}

/** A baseline JPEG: start of image, a JFIF segment, a frame header naming its size, then end of image. */
export function jpegBytes(width: number, height: number): Uint8Array<ArrayBuffer> {
  const jfif = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, ...bigEndian(height, 2), ...bigEndian(width, 2), 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01];
  return Uint8Array.from([0xff, 0xd8, ...jfif, ...sof0, 0xff, 0xd9]);
}
