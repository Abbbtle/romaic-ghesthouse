import type { Actor } from "@/lib/kernel/actor";
import type { AuditCategory, AuditRecorder } from "@/lib/kernel/audit";
import type { Clock, IdGenerator } from "@/lib/kernel/ports";
import { done, refusedWith, type ChangeResult } from "@/lib/kernel/result";
import { imageLimits, sniffImage } from "./image";

/**
 * Private files: receipts, proof of submission, task photos and guest ID
 * documents. Unlike public images they're never cached by shared caches and
 * never served without a check: who may store or open one depends on its
 * purpose (roles.md, R12). Each file's type is read from its bytes (JPEG,
 * PNG, WebP or PDF), never from its name or the browser's word, and it is
 * always served as a download, so a browser never runs it as a page.
 */

export const privateFilePurposes = ["receipt", "proof-of-submission", "task-photo", "document"] as const;

export type PrivateFilePurpose = (typeof privateFilePurposes)[number];

/** The permissions that open private files, as the accounts core names them (src/server wires the check in). */
export type PrivateFilePermission = "expenses:manage" | "tax:manage" | "tasks:work" | "guests:id-numbers";

/** Checks the actor's permission; src/server passes the accounts core's can and assertCan. */
export type PrivateFileAccess = {
  can(actor: Actor, permission: PrivateFilePermission): boolean;
  /** Throws the accounts core's NotAllowedError when the actor lacks the permission. */
  assertCan(actor: Actor, permission: PrivateFilePermission): void;
};

/** The permission that opens each kind of file. */
export const privateFilePermissions: Record<PrivateFilePurpose, PrivateFilePermission> = {
  receipt: "expenses:manage",
  "proof-of-submission": "tax:manage",
  "task-photo": "tasks:work",
  /** Guest ID documents, only ever kept if the client confirms a legal need (roles.md D4). */
  document: "guests:id-numbers",
};

/**
 * Where storing each kind of file is recorded in the audit log. The category
 * decides who reads the entry, so each one is no wider than who may open the
 * file (src/server/finance-denial.test.ts checks every pair).
 */
export const privateFileAuditCategories: Record<PrivateFilePurpose, AuditCategory> = {
  receipt: "money",
  "proof-of-submission": "tax",
  "task-photo": "tasks",
  document: "guests",
};

export const privateFileContentTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

export type PrivateFileContentType = (typeof privateFileContentTypes)[number];

export type NewPrivateFile = {
  id: string;
  purpose: PrivateFilePurpose;
  fileName: string;
  contentType: PrivateFileContentType;
  bytes: Uint8Array;
  createdAt: Date;
  createdBy: string;
};

export type StoredPrivateFile = Omit<NewPrivateFile, "createdBy"> & { byteSize: number; sha256: string; createdBy: string | null };

export interface PrivateFileStore {
  save(file: NewPrivateFile): Promise<void>;
  find(id: string): Promise<StoredPrivateFile | null>;
}

/** The most a private file may hold: the same 3.5 MB as images (Vercel's request limit, form overhead included). */
export const privateFileMaxBytes = imageLimits.maxBytes;

const pdfSignature = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** A file's real type from its first bytes, or null for anything that isn't an accepted image or a PDF. */
export function sniffPrivateFile(bytes: Uint8Array): PrivateFileContentType | null {
  if (pdfSignature.every((byte, index) => bytes[index] === byte)) return "application/pdf";
  return sniffImage(bytes)?.contentType ?? null;
}

/** A file name safe to store and to put in a Content-Disposition header: no paths, no control or quote characters. */
export function safeFileName(name: string, contentType: PrivateFileContentType): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  const extension = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf" }[contentType];
  const stem = cleaned.replace(/\.[^.]*$/, "") || "file";
  return `${stem}${extension}`;
}

const fileIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type PrivateFileServiceDependencies = {
  store: PrivateFileStore;
  access: PrivateFileAccess;
  ids: IdGenerator;
  clock: Clock;
  audit: AuditRecorder;
};

export function createPrivateFileService(deps: PrivateFileServiceDependencies) {
  return {
    /** Stores a file for `purpose`, after checking the actor may handle that kind and the bytes are an accepted type. */
    async store(actor: Actor, input: { purpose: PrivateFilePurpose; fileName: string; bytes: Uint8Array }): Promise<ChangeResult<{ id: string }>> {
      deps.access.assertCan(actor, privateFilePermissions[input.purpose]);
      if (input.bytes.length === 0) return refusedWith("Choose a file to upload.");
      if (input.bytes.length > privateFileMaxBytes) return refusedWith("That file is larger than 3.5 MB. Choose a smaller one.");
      const contentType = sniffPrivateFile(input.bytes);
      if (!contentType) return refusedWith("Choose a PDF, or a JPEG, PNG or WebP photo.");
      const id = deps.ids.newId();
      const fileName = safeFileName(input.fileName, contentType);
      await deps.store.save({ id, purpose: input.purpose, fileName, contentType, bytes: input.bytes, createdAt: deps.clock.now(), createdBy: actor.id });
      await deps.audit.record({
        actor,
        category: privateFileAuditCategories[input.purpose],
        action: "file.stored",
        target: { type: "private-file", id },
        summary: `Uploaded ${fileName}`,
        details: { purpose: input.purpose, contentType, byteSize: input.bytes.length },
      });
      return done({ id });
    },

    /** A file the actor may open, or null when there's none or their role doesn't cover its purpose (never saying which). */
    async open(actor: Actor, id: string): Promise<StoredPrivateFile | null> {
      if (!fileIdPattern.test(id)) return null;
      const file = await deps.store.find(id);
      if (!file) return null;
      return deps.access.can(actor, privateFilePermissions[file.purpose]) ? file : null;
    },
  };
}

export type PrivateFileService = ReturnType<typeof createPrivateFileService>;
