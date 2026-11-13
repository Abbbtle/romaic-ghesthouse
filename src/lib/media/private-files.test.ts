import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryAuditRecorder } from "@/lib/kernel/audit";
import type { Actor } from "@/lib/kernel/actor";
import { createPrivateFileService, privateFileMaxBytes, safeFileName, sniffPrivateFile, type PrivateFileAccess, type PrivateFileStore, type StoredPrivateFile } from "./private-files";

/** The matrix from roles.md, for the purposes files use (the real check is wired in src/server). */
const grants: Record<string, readonly string[]> = { owner: ["expenses:manage", "tax:manage", "tasks:work", "guests:id-numbers"], staff: ["tasks:work"] };
const access: PrivateFileAccess = {
  can: (actor, permission) => grants[actor.role]?.includes(permission) ?? false,
  assertCan: (actor, permission) => {
    if (!(grants[actor.role]?.includes(permission) ?? false)) throw new Error("not allowed");
  },
};

const owner: Actor = { id: "00000000-0000-4000-8000-000000000001", role: "owner", name: "Nico" };
const staff: Actor = { id: "00000000-0000-4000-8000-000000000002", role: "staff", name: "Thabo" };
const pdf = new TextEncoder().encode("%PDF-1.7 receipt");
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);

function service() {
  const stored = new Map<string, StoredPrivateFile>();
  const store: PrivateFileStore = {
    async save(file) {
      stored.set(file.id, { ...file, byteSize: file.bytes.length, sha256: "x", createdBy: file.createdBy });
    },
    async find(id) {
      return stored.get(id) ?? null;
    },
  };
  let next = 0;
  const audit = memoryAuditRecorder();
  return { audit, files: createPrivateFileService({ store, access, ids: { newId: () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}` }, clock: { now: () => new Date("2026-11-12T08:00:00.000Z") }, audit }) };
}

describe("private files", () => {
  it("reads a file's real type from its bytes: PDF and photos only", () => {
    assert.equal(sniffPrivateFile(pdf), "application/pdf");
    assert.equal(sniffPrivateFile(png), "image/png");
    assert.equal(sniffPrivateFile(new TextEncoder().encode("<svg onload=alert(1)>")), null);
    assert.equal(sniffPrivateFile(new TextEncoder().encode("<html>")), null);
  });

  it("keeps file names to a safe name with the extension of the real type", () => {
    assert.equal(safeFileName("../../etc/passwd", "application/pdf"), "passwd.pdf");
    assert.equal(safeFileName('Receipt "June".exe', "image/jpeg"), "Receipt June.jpg");
    assert.equal(safeFileName("", "image/png"), "file.png");
  });

  it("stores a receipt for the owner and audits it as money", async () => {
    const { files, audit } = service();
    const saved = await files.store(owner, { purpose: "receipt", fileName: "till slip.pdf", bytes: pdf });
    assert.ok(saved.ok);
    assert.equal(audit.events[0]?.category, "money");
    assert.equal((await files.open(owner, saved.id))?.fileName, "till slip.pdf");
  });

  it("lets staff handle task photos but never open a receipt", async () => {
    const { files } = service();
    const receipt = await files.store(owner, { purpose: "receipt", fileName: "r.pdf", bytes: pdf });
    assert.ok(receipt.ok);
    assert.equal(await files.open(staff, receipt.id), null);
    const photo = await files.store(staff, { purpose: "task-photo", fileName: "leak.png", bytes: png });
    assert.ok(photo.ok);
    assert.ok(await files.open(staff, photo.id));
  });

  it("refuses empty, oversized and unaccepted files, and ids that can't exist", async () => {
    const { files } = service();
    assert.equal((await files.store(owner, { purpose: "receipt", fileName: "x", bytes: new Uint8Array() })).ok, false);
    assert.equal((await files.store(owner, { purpose: "receipt", fileName: "x", bytes: new Uint8Array(privateFileMaxBytes + 1) })).ok, false);
    assert.equal((await files.store(owner, { purpose: "receipt", fileName: "x.txt", bytes: new TextEncoder().encode("hello") })).ok, false);
    assert.equal(await files.open(owner, "../secrets"), null);
  });
});
