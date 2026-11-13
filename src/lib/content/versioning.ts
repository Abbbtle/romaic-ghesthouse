import type { IsoDate } from "@/lib/format/zoned-time";
import type { SectionData, SectionKey } from "./schema";

/**
 * Text that people agree to carries a version: the Privacy Notice page and
 * the booking form's consent wording. Each booking request records the
 * versions it was sent under, so a change to the text must never keep the
 * old number. When a save changes that text without the editor setting a
 * new version (or a new date), the save gets the next version and today's
 * date.
 */

/** The next version: the last number goes up by one ("1.0" → "1.1", "3" → "4"). */
export function nextVersion(version: string): string {
  const match = /^(.*?)(\d+)$/.exec(version);
  if (!match) return `${version}.1`;
  return `${match[1] ?? ""}${Number(match[2]) + 1}`;
}

/** Turns what an editor submitted into what is saved, given the section as it was. */
type Reviser<K extends SectionKey> = (previous: SectionData<K>, next: SectionData<K>, today: IsoDate) => SectionData<K>;

const revisers: { [K in SectionKey]?: Reviser<K> } = {
  book(previous, next, today) {
    if (next.consent.label === previous.consent.label) return next;
    return {
      ...next,
      consent: {
        ...next.consent,
        version: next.consent.version === previous.consent.version ? nextVersion(previous.consent.version) : next.consent.version,
        updatedOn: next.consent.updatedOn === previous.consent.updatedOn ? today : next.consent.updatedOn,
      },
    };
  },
  privacy(previous, next, today) {
    if (next.body === previous.body) return next;
    return {
      ...next,
      version: next.version === previous.version ? nextVersion(previous.version) : next.version,
      updatedOn: next.updatedOn === previous.updatedOn ? today : next.updatedOn,
    };
  },
};

/**
 * The section as it should be saved: `next`, with the versions of agreed
 * text moved on where its wording changed since `previous`.
 */
export function reviseSection<K extends SectionKey>(key: K, previous: SectionData<K>, next: SectionData<K>, today: IsoDate): SectionData<K> {
  const revise: Reviser<K> | undefined = revisers[key];
  return revise ? revise(previous, next, today) : next;
}
