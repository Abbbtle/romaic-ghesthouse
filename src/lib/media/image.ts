/**
 * What an uploaded file really is, read from its first bytes rather than
 * trusted from its name or the browser's word: JPEG, PNG or WebP, with its
 * size in pixels. Nothing else is accepted, SVG least of all (it can carry
 * scripts).
 */

export const imageContentTypes = ["image/jpeg", "image/png", "image/webp"] as const;

export type ImageContentType = (typeof imageContentTypes)[number];

export type SniffedImage = { contentType: ImageContentType; width: number; height: number };

/**
 * The largest image the site stores. The dashboard makes photos at most 2,000
 * px on the long edge before uploading them, which keeps them far below both.
 */
export const imageLimits = {
  /** 3.5 MB: fits Vercel's 4.5 MB request limit, form overhead included. */
  maxBytes: 3.5 * 1024 * 1024,
  /** Pixels on either edge: the most Vercel's image optimiser takes. */
  maxEdge: 8192,
} as const;

/** The type and size in pixels of a JPEG, PNG or WebP image, or null for anything else (or a damaged header). */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  return sniffPng(bytes) ?? sniffJpeg(bytes) ?? sniffWebp(bytes);
}

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, prefix: readonly number[], at = 0): boolean {
  return prefix.every((byte, index) => bytes[at + index] === byte);
}

function ascii(bytes: Uint8Array, at: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(at, at + length));
}

function uint16BE(bytes: Uint8Array, at: number): number {
  return ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0);
}

function uint32BE(bytes: Uint8Array, at: number): number {
  return (((bytes[at] ?? 0) << 24) | ((bytes[at + 1] ?? 0) << 16) | ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0)) >>> 0;
}

function uintLE(bytes: Uint8Array, at: number, length: number): number {
  let value = 0;
  for (let index = length - 1; index >= 0; index--) value = value * 256 + (bytes[at + index] ?? 0);
  return value;
}

/** PNG: the signature, then the IHDR chunk, which holds the width and height. */
function sniffPng(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length < 24 || !startsWith(bytes, pngSignature) || ascii(bytes, 12, 4) !== "IHDR") return null;
  return sized("image/png", uint32BE(bytes, 16), uint32BE(bytes, 20));
}

// Start-of-frame markers hold a JPEG's size: SOF0–SOF15 (0xC0–0xCF), except DHT, JPG and DAC,
// which share the range but mean something else.
const notStartOfFrame = new Set([0xc4, 0xc8, 0xcc]);
// Markers that stand alone, without a length: TEM, RST0–RST7.
const standalone = new Set([0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7]);

/**
 * JPEG: walks the segments to the start-of-frame. A photo whose Exif
 * orientation turns it on its side is shown turned, so its width and height
 * are swapped to match.
 */
function sniffJpeg(bytes: Uint8Array): SniffedImage | null {
  if (!startsWith(bytes, [0xff, 0xd8, 0xff])) return null;
  let sideways = false;
  let at = 2;
  while (at + 3 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1] ?? 0;
    if (marker === 0xff) {
      at += 1; // fill byte
      continue;
    }
    if (standalone.has(marker)) {
      at += 2;
      continue;
    }
    // End of image, or the image data starting, before any frame header: not a usable JPEG.
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = uint16BE(bytes, at + 2);
    if (length < 2) return null;
    if (marker === 0xe1) sideways ||= exifTurnsSideways(bytes, at + 4, length - 2);
    if (marker >= 0xc0 && marker <= 0xcf && !notStartOfFrame.has(marker)) {
      if (at + 9 > bytes.length) return null;
      const height = uint16BE(bytes, at + 5);
      const width = uint16BE(bytes, at + 7);
      return sideways ? sized("image/jpeg", height, width) : sized("image/jpeg", width, height);
    }
    at += 2 + length;
  }
  return null;
}

/** Whether an APP1 segment's Exif orientation (5–8) rotates the picture a quarter turn. */
function exifTurnsSideways(bytes: Uint8Array, start: number, length: number): boolean {
  const end = Math.min(start + length, bytes.length);
  if (end - start < 14 || ascii(bytes, start, 6) !== "Exif\0\0") return false;
  const tiff = start + 6;
  const littleEndian = ascii(bytes, tiff, 2) === "II";
  if (!littleEndian && ascii(bytes, tiff, 2) !== "MM") return false;
  const read = (at: number, size: 2 | 4) =>
    at + size > end ? null : littleEndian ? uintLE(bytes, at, size) : size === 2 ? uint16BE(bytes, at) : uint32BE(bytes, at);
  const firstDirectory = read(tiff + 4, 4);
  if (firstDirectory === null) return false;
  const directory = tiff + firstDirectory;
  const entries = read(directory, 2);
  if (entries === null) return false;
  for (let entry = 0; entry < entries; entry++) {
    const at = directory + 2 + entry * 12;
    const tag = read(at, 2);
    if (tag === null) return false;
    if (tag === 0x0112) {
      const orientation = read(at + 8, 2);
      return orientation !== null && orientation >= 5 && orientation <= 8;
    }
  }
  return false;
}

/** WebP: a RIFF container whose first chunk is lossy (VP8), lossless (VP8L) or extended (VP8X). */
function sniffWebp(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length < 16 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return null;
  switch (ascii(bytes, 12, 4)) {
    case "VP8 ":
      // A key frame: 3 bytes of frame tag, the start code 9D 01 2A, then 14-bit width and height.
      if (bytes.length < 30 || !startsWith(bytes, [0x9d, 0x01, 0x2a], 23)) return null;
      return sized("image/webp", uintLE(bytes, 26, 2) & 0x3fff, uintLE(bytes, 28, 2) & 0x3fff);
    case "VP8L": {
      // The signature byte 0x2F, then width − 1 and height − 1 in 14 bits each.
      if (bytes.length < 25 || bytes[20] !== 0x2f) return null;
      const bits = uintLE(bytes, 21, 4);
      return sized("image/webp", (bits % 0x4000) + 1, (Math.floor(bits / 0x4000) % 0x4000) + 1);
    }
    case "VP8X":
      // The canvas size: width − 1 and height − 1 in 24 bits each.
      if (bytes.length < 30) return null;
      return sized("image/webp", uintLE(bytes, 24, 3) + 1, uintLE(bytes, 27, 3) + 1);
    default:
      return null;
  }
}

function sized(contentType: ImageContentType, width: number, height: number): SniffedImage | null {
  return width > 0 && height > 0 ? { contentType, width, height } : null;
}
