import "server-only";
import { imageContentTypes, type ImageContentType } from "@/lib/media/image";
import type { MediaStore, StoredImage } from "@/lib/media/ports";
import {
  privateFileContentTypes,
  privateFilePurposes,
  type PrivateFileContentType,
  type PrivateFilePurpose,
  type PrivateFileStore,
  type StoredPrivateFile,
} from "@/lib/media/private-files";
import type { Database } from "./database";
import { isUuid } from "./uuid";

type MediaRow = {
  id: string;
  content_type: string;
  width: number;
  height: number;
  byte_size: number;
  sha256: string;
  bytes: Uint8Array;
  created_at: Date;
};

const isImageContentType = (value: string): value is ImageContentType => (imageContentTypes as readonly string[]).includes(value);

/**
 * Images in Postgres (app.media; see ./migrations/050-media.ts). The size
 * and SHA-256 are worked out by Postgres from the bytes it stores, so they
 * always describe them.
 */
export function createPostgresMediaStore(db: Database): MediaStore {
  return {
    async save(image) {
      await db.run(
        `insert into app.media (id, content_type, width, height, byte_size, sha256, bytes, created_at, created_by)
         values (:id, :contentType, :width, :height, octet_length(:bytes::bytea), encode(sha256(:bytes::bytea), 'hex'), :bytes::bytea,
           :createdAt, :createdBy)`,
        {
          id: image.id,
          contentType: image.contentType,
          width: image.width,
          height: image.height,
          bytes: image.bytes,
          createdAt: image.createdAt,
          createdBy: image.createdBy,
        },
      );
    },

    async find(id): Promise<StoredImage | null> {
      if (!isUuid(id)) return null;
      const row = await db.get<MediaRow>(
        "select id, content_type, width, height, byte_size, sha256, bytes, created_at from app.media where id = :id",
        { id },
      );
      if (!row) return null;
      // The table's check constraint allows only these; a row that slipped past it isn't served.
      if (!isImageContentType(row.content_type)) return null;
      return {
        id: row.id,
        contentType: row.content_type,
        width: row.width,
        height: row.height,
        byteSize: row.byte_size,
        sha256: row.sha256,
        bytes: row.bytes,
        createdAt: row.created_at,
      };
    },
  };
}

type PrivateFileRow = {
  id: string;
  purpose: string;
  file_name: string;
  content_type: string;
  byte_size: number;
  sha256: string;
  bytes: Uint8Array;
  created_at: Date;
  created_by: string | null;
};

const isPrivatePurpose = (value: string): value is PrivateFilePurpose => (privateFilePurposes as readonly string[]).includes(value);
const isPrivateContentType = (value: string): value is PrivateFileContentType => (privateFileContentTypes as readonly string[]).includes(value);

/** Private files in Postgres (app.private_files; see ./migrations/050-media.ts). Size and SHA-256 come from the stored bytes. */
export function createPostgresPrivateFileStore(db: Database): PrivateFileStore {
  return {
    async save(file) {
      await db.run(
        `insert into app.private_files (id, purpose, file_name, content_type, byte_size, sha256, bytes, created_at, created_by)
         values (:id, :purpose, :fileName, :contentType, octet_length(:bytes::bytea), encode(sha256(:bytes::bytea), 'hex'), :bytes::bytea, :createdAt, :createdBy)`,
        { id: file.id, purpose: file.purpose, fileName: file.fileName, contentType: file.contentType, bytes: file.bytes, createdAt: file.createdAt, createdBy: file.createdBy },
      );
    },

    async find(id): Promise<StoredPrivateFile | null> {
      if (!isUuid(id)) return null;
      const row = await db.get<PrivateFileRow>(
        "select id, purpose, file_name, content_type, byte_size, sha256, bytes, created_at, created_by from app.private_files where id = :id",
        { id },
      );
      if (!row || !isPrivatePurpose(row.purpose) || !isPrivateContentType(row.content_type)) return null;
      return {
        id: row.id,
        purpose: row.purpose,
        fileName: row.file_name,
        contentType: row.content_type,
        byteSize: row.byte_size,
        sha256: row.sha256,
        bytes: row.bytes,
        createdAt: row.created_at,
        createdBy: row.created_by,
      };
    },
  };
}
