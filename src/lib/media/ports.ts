import type { ImageContentType } from "./image";

/**
 * What the media service needs from storage. The Postgres adapter keeps
 * images in the database (app.media), which the site serves from
 * /media/<id>.
 */

/** An image to store. Its id is new, so storing it never replaces another. */
export type NewImage = {
  id: string;
  contentType: ImageContentType;
  width: number;
  height: number;
  bytes: Uint8Array;
  createdAt: Date;
  /** The account that uploaded it, or null (for example, when seeded). */
  createdBy: string | null;
};

/** A stored image, as served. */
export type StoredImage = {
  id: string;
  contentType: ImageContentType;
  width: number;
  height: number;
  byteSize: number;
  /** Hex SHA-256 of the bytes. */
  sha256: string;
  bytes: Uint8Array;
  createdAt: Date;
};

export interface MediaStore {
  save(image: NewImage): Promise<void>;
  find(id: string): Promise<StoredImage | null>;
}
