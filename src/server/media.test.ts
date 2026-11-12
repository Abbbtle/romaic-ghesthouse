import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { StoredImage } from "@/lib/media/ports";
import { imageResponse } from "./media";

const image: StoredImage = {
  id: "0b7d9a52-3f0e-4c55-9d8c-2f1e6a4b5c7d",
  contentType: "image/png",
  width: 1,
  height: 1,
  byteSize: 3,
  sha256: "c0ffee",
  bytes: Uint8Array.from([1, 2, 3]),
  createdAt: new Date("2026-10-20T08:00:00Z"),
};

describe("imageResponse", () => {
  it("serves a stored image as the type it was checked to be, cached for a year", async () => {
    const response = imageResponse(image);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("content-length"), "3");
    assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, s-maxage=31536000, immutable");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("etag"), '"c0ffee"');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), Uint8Array.from([1, 2, 3]));
  });

  it("answers 404, never cached, when there's no such image", async () => {
    const response = imageResponse(null);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), null);
    assert.equal(await response.text(), "Not found");
  });
});
