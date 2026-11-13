import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fittedSize, hasTransparentPixels, mayBeTransparent, sizeLabel } from "./prepare-image";

describe("preparing a photo to upload", () => {
  it("fits the long edge within the limit, keeping the shape, and never enlarges", () => {
    assert.deepEqual(fittedSize(4000, 5333, 2000), { width: 1500, height: 2000 });
    assert.deepEqual(fittedSize(6000, 4000, 2000), { width: 2000, height: 1333 });
    assert.deepEqual(fittedSize(1200, 800, 2000), { width: 1200, height: 800 });
    assert.deepEqual(fittedSize(9000, 1, 2000), { width: 2000, height: 1 });
  });

  it("only looks for see-through parts where a format can have them", () => {
    assert.equal(mayBeTransparent("image/jpeg"), false);
    assert.equal(mayBeTransparent("image/png"), true);
    assert.equal(mayBeTransparent("image/webp"), true);
    assert.equal(mayBeTransparent(""), true);
  });

  it("finds a see-through pixel among opaque ones", () => {
    assert.equal(hasTransparentPixels(Uint8ClampedArray.from([1, 2, 3, 255, 4, 5, 6, 255])), false);
    assert.equal(hasTransparentPixels(Uint8ClampedArray.from([1, 2, 3, 255, 4, 5, 6, 254])), true);
  });

  it("says how small the photo was made", () => {
    assert.equal(sizeLabel(331_553), "324 KB");
    assert.equal(sizeLabel(200), "1 KB");
    assert.equal(sizeLabel(2.5 * 1024 * 1024), "2.5 MB");
  });
});
