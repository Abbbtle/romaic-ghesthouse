import type { SectionData, SectionKey } from "@/lib/content/schema";

/** A section's key with its content, so each editor gets the content it edits. */
export type EditableContent = { [K in SectionKey]: { key: K; data: SectionData<K> } }[SectionKey];

/**
 * A section's key and content as one value, for the page to hand its
 * editor. They come from the same getEditable(key), but TypeScript can't tie
 * a generic key's content to its member of the union, hence the cast.
 */
export function editableContent<K extends SectionKey>(key: K, data: SectionData<K>): EditableContent {
  return { key, data } as EditableContent;
}
