import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import type { NewImage } from "@/lib/media/ports";
import { createPostgresAccountStore } from "./account-stores";
import { createPostgresMediaStore } from "./media-store";
import type { TestDatabases } from "./testing/test-databases";

const at = new Date("2026-10-20T08:00:00.000Z");
const imageId = "10000000-0000-4000-8000-000000000001";
const ownerId = "00000000-0000-4000-8000-000000000001";
const adminId = "00000000-0000-4000-8000-000000000002";

// Not a real photo: the store keeps whatever bytes the media service checked.
const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0x00, 0x10, 0x20, 0xfe]);

const image = (overrides: Partial<NewImage> = {}): NewImage => ({
  id: imageId,
  contentType: "image/jpeg",
  width: 1500,
  height: 2000,
  bytes,
  createdAt: at,
  createdBy: null,
  ...overrides,
});

/** What the Postgres media store promises (see src/lib/media/ports.ts), on PGlite and on a real server. */
export function describeMediaStoreContract(databases: TestDatabases): void {
  describe(`${databases.label}: media`, () => {
    it("serves back exactly the bytes it stored, with their size and SHA-256", async () => {
      const store = createPostgresMediaStore(databases.migrated());
      await store.save(image());
      const found = await store.find(imageId);
      assert.deepEqual(found, {
        id: imageId,
        contentType: "image/jpeg",
        width: 1500,
        height: 2000,
        byteSize: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes,
        createdAt: at,
      });
      assert.equal(Object.getPrototypeOf(found?.bytes), Uint8Array.prototype);
    });

    it("finds nothing for an id it doesn't have, or one that can't be an id", async () => {
      const store = createPostgresMediaStore(databases.migrated());
      assert.equal(await store.find("10000000-0000-4000-8000-0000000000ff"), null);
      assert.equal(await store.find("../../etc/passwd"), null);
    });

    it("never stores a type it can't serve safely", async () => {
      const store = createPostgresMediaStore(databases.migrated());
      await assert.rejects(store.save({ ...image(), contentType: "image/svg+xml" as never }));
    });

    it("keeps an image when the person who uploaded it leaves the team", async () => {
      const db = databases.migrated();
      const accounts = createPostgresAccountStore(db);
      const member = { name: "Someone", status: "active" as const, passwordHash: "x", mustChangePassword: false, temporaryPasswordExpiresAt: null, emailVerifiedAt: null, createdAt: at, updatedAt: at, lastSignedInAt: null };
      await accounts.createFirstOwner({ ...member, id: ownerId, email: "owner@example.com", role: "owner" });
      await accounts.create({ ...member, id: adminId, email: "admin@example.com", role: "admin" });
      const store = createPostgresMediaStore(db);
      await store.save(image({ createdBy: adminId }));
      assert.equal(await accounts.remove(adminId, { role: "admin" }), "changed");
      assert.equal((await store.find(imageId))?.id, imageId);
    });
  });
}
