import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Actor } from "@/lib/kernel/actor";
import { fixedClock } from "@/lib/kernel/ports";
import { imageLimits } from "./image";
import { pngBytes } from "./testing/image-bytes";
import { createMediaService, isMediaId, mediaSrc } from "./media-service";
import type { MediaStore, NewImage, StoredImage } from "./ports";
import { readImageFile } from "./upload";

const actor: Actor = { id: "00000000-0000-4000-8000-000000000001", role: "admin", name: "Sam" };
const at = "2026-10-20T08:00:00.000Z";

/** Permission checks that let everyone through; the refusal test below uses one that doesn't. */
const allowAll = { assertCan: () => {} };
const png = pngBytes(1429, 315);

/** A PNG header claiming the given size: enough for the size checks. */
function pngHeader(width: number, height: number): Uint8Array {
  const header = png.slice(0, 24);
  new DataView(header.buffer).setUint32(16, width);
  new DataView(header.buffer).setUint32(20, height);
  return header;
}

function memoryMediaStore(): MediaStore & { saved: NewImage[] } {
  const saved: NewImage[] = [];
  return {
    saved,
    async save(image) {
      saved.push(image);
    },
    async find(id): Promise<StoredImage | null> {
      const image = saved.find((candidate) => candidate.id === id);
      return image ? { ...image, byteSize: image.bytes.length, sha256: "not checked here" } : null;
    },
  };
}

function service() {
  const store = memoryMediaStore();
  let next = 0;
  const media = createMediaService({ store, clock: fixedClock(at), access: allowAll, ids: { newId: () => `10000000-0000-4000-8000-${String(++next).padStart(12, "0")}` } });
  return { store, media };
}

describe("media uploads", () => {
  it("refuses an upload from someone whose role can't manage media, before reading the file", async () => {
    const refusal = new Error("not allowed");
    const media = createMediaService({
      store: { save: async () => assert.fail("nothing is stored"), find: async () => null } as unknown as MediaStore,
      clock: fixedClock(at),
      ids: { newId: () => "" },
      access: {
        assertCan: (_actor, permission) => {
          assert.equal(permission, "media:manage");
          throw refusal;
        },
      },
    });
    await assert.rejects(media.upload({ ...actor, role: "staff" }, png), refusal);
  });

  it("stores a real image under a new id, recording who uploaded it, and says where it's served", async () => {
    const { store, media } = service();
    const result = await media.upload(actor, png);
    assert.deepEqual(result, { ok: true, id: "10000000-0000-4000-8000-000000000001", src: "/media/10000000-0000-4000-8000-000000000001", width: 1429, height: 315 });
    assert.deepEqual(store.saved[0], {
      id: "10000000-0000-4000-8000-000000000001",
      contentType: "image/png",
      width: 1429,
      height: 315,
      bytes: png,
      createdAt: new Date(at),
      createdBy: actor.id,
    });
    assert.equal((await media.upload(actor, png)).ok && store.saved[1]?.id, "10000000-0000-4000-8000-000000000002", "uploading again stores a new image");
  });

  it("refuses what isn't a JPEG, PNG or WebP, whatever it's called", async () => {
    const { store, media } = service();
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    assert.deepEqual(await media.upload(actor, svg), { ok: false, errors: { form: "Choose a JPEG, PNG or WebP image." } });
    assert.deepEqual(await media.upload(actor, new Uint8Array()), { ok: false, errors: { form: "Choose an image to upload." } });
    assert.equal(store.saved.length, 0);
  });

  it("refuses images over 3.5 MB or 8192 pixels across", async () => {
    const { media } = service();
    const oversized = new Uint8Array(imageLimits.maxBytes + 1);
    oversized.set(png);
    assert.deepEqual(await media.upload(actor, oversized), { ok: false, errors: { form: "That image is larger than 3.5 MB. Choose a smaller one." } });
    assert.deepEqual(await media.upload(actor, pngHeader(8193, 100)), {
      ok: false,
      errors: { form: "That image is more than 8192 pixels across. Choose a smaller one." },
    });
    assert.equal((await media.upload(actor, pngHeader(8192, 8192))).ok, true);
  });

  it("finds stored images by id, and never looks up an id that can't be one", async () => {
    const { store, media } = service();
    const uploaded = await media.upload(actor, png);
    assert.ok(uploaded.ok);
    assert.equal((await media.get(uploaded.id))?.contentType, "image/png");
    let lookups = 0;
    const counting = createMediaService({ store: { ...store, find: async () => (lookups++, null) }, clock: fixedClock(at), access: allowAll, ids: { newId: () => "" } });
    assert.equal(await counting.get("../../etc/passwd"), null);
    assert.equal(await counting.get("10000000-0000-4000-8000-00000000000A"), null, "ids are lower case");
    assert.equal(lookups, 0);
  });

  it("names media ids and URLs", () => {
    assert.equal(isMediaId("10000000-0000-4000-8000-000000000001"), true);
    assert.equal(isMediaId("hero-workout.jpg"), false);
    assert.equal(mediaSrc("10000000-0000-4000-8000-000000000001"), "/media/10000000-0000-4000-8000-000000000001");
  });
});

describe("readImageFile", () => {
  it("reads an uploaded file's bytes", async () => {
    assert.deepEqual(await readImageFile(new File([png], "logo.png", { type: "image/png" })), { ok: true, value: png });
  });

  it("refuses a missing or empty file, or text, without reading anything", async () => {
    const chooseOne = { ok: false, errors: { form: "Choose an image to upload." } };
    assert.deepEqual(await readImageFile(null), chooseOne);
    assert.deepEqual(await readImageFile("logo.png"), chooseOne);
    assert.deepEqual(await readImageFile(new File([], "empty.png")), chooseOne);
  });

  it("refuses an oversized file by its size, before reading it into memory", async () => {
    const huge = new File([new Uint8Array(imageLimits.maxBytes + 1)], "huge.jpg");
    Object.defineProperty(huge, "arrayBuffer", { value: () => Promise.reject(new Error("read the whole file")) });
    assert.deepEqual(await readImageFile(huge), { ok: false, errors: { form: "That image is larger than 3.5 MB. Choose a smaller one." } });
  });
});
