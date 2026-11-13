import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sniffImage } from "./image";
import { jpegBytes, pngBytes } from "./testing/image-bytes";


/** A RIFF/WEBP file whose first chunk is `fourCC` with `body`: enough header for sniffing. */
function webp(fourCC: string, body: number[]): Uint8Array {
  const ascii = (text: string) => [...text].map((character) => character.charCodeAt(0));
  const chunk = [...ascii(fourCC), body.length & 0xff, (body.length >> 8) & 0xff, 0, 0, ...body];
  const size = 4 + chunk.length;
  return Uint8Array.from([...ascii("RIFF"), size & 0xff, (size >> 8) & 0xff, 0, 0, ...ascii("WEBP"), ...chunk]);
}

const littleEndian = (value: number, bytes: number) => Array.from({ length: bytes }, (_, index) => Math.floor(value / 256 ** index) % 256);

/** A JPEG with an Exif segment saying how to turn it, inserted after its start-of-image marker. */
function withExifOrientation(jpeg: Uint8Array, orientation: number): Uint8Array {
  // "Exif\0\0", then a big-endian TIFF header and a directory with one entry: Orientation (0x0112), SHORT, 1 value.
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0];
  const segment = [0xff, 0xe1, ((exif.length + 2) >> 8) & 0xff, (exif.length + 2) & 0xff, ...exif];
  return Uint8Array.from([...jpeg.subarray(0, 2), ...segment, ...jpeg.subarray(2)]);
}

describe("sniffImage", () => {
  it("reads the type and size of JPEG and PNG images", () => {
    assert.deepEqual(sniffImage(jpegBytes(1500, 2000)), { contentType: "image/jpeg", width: 1500, height: 2000 });
    assert.deepEqual(sniffImage(jpegBytes(1514, 2000)), { contentType: "image/jpeg", width: 1514, height: 2000 });
    assert.deepEqual(sniffImage(pngBytes(1429, 315)), { contentType: "image/png", width: 1429, height: 315 });
    assert.deepEqual(sniffImage(pngBytes(1200, 845)), { contentType: "image/png", width: 1200, height: 845 });
  });

  it("swaps a JPEG's width and height when its Exif orientation turns it on its side", () => {
    const hero = jpegBytes(1500, 2000);
    assert.deepEqual(sniffImage(withExifOrientation(hero, 6)), { contentType: "image/jpeg", width: 2000, height: 1500 });
    assert.deepEqual(sniffImage(withExifOrientation(hero, 3)), { contentType: "image/jpeg", width: 1500, height: 2000 }, "upside down keeps its shape");
  });

  it("reads lossy, lossless and extended WebP headers", () => {
    // VP8: frame tag, start code 9D 01 2A, then 14-bit width and height (little-endian).
    assert.deepEqual(sniffImage(webp("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, ...littleEndian(1200, 2), ...littleEndian(800, 2)])), {
      contentType: "image/webp",
      width: 1200,
      height: 800,
    });
    // VP8L: signature 0x2F, then width − 1 and height − 1 in 14 bits each.
    assert.deepEqual(sniffImage(webp("VP8L", [0x2f, ...littleEndian(1199 + 799 * 2 ** 14, 4)])), { contentType: "image/webp", width: 1200, height: 800 });
    // VP8X: flags, three reserved bytes, then canvas width − 1 and height − 1 in 24 bits each.
    assert.deepEqual(sniffImage(webp("VP8X", [0x10, 0, 0, 0, ...littleEndian(1999, 3), ...littleEndian(1499, 3)])), {
      contentType: "image/webp",
      width: 2000,
      height: 1500,
    });
  });

  it("refuses anything else, and damaged headers", () => {
    const text = (value: string) => new TextEncoder().encode(value);
    assert.equal(sniffImage(new Uint8Array()), null);
    assert.equal(sniffImage(text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), null);
    assert.equal(sniffImage(text("GIF89a\u0001\u0000\u0001\u0000")), null);
    assert.equal(sniffImage(pngBytes(1429, 315).subarray(0, 20)), null, "a cut-off PNG");
    assert.equal(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0, 2])), null, "a JPEG whose image data starts before any size");
    assert.equal(sniffImage(webp("VP8 ", [0, 0, 0, 0, 0, 0, 1, 0, 1, 0])), null, "a VP8 chunk without its start code");
    assert.equal(sniffImage(webp("ALPH", [0, 0, 0, 0])), null);
  });
});
