import type { RevisionSummary } from "@/lib/content/ports";
import type { SectionKey } from "@/lib/content/schema";
import { List, ListRow } from "../list";
import { Panel } from "../panel";
import { StatusPill } from "../status-pill";
import { capitalised, whenLabel } from "../when-label";
import { contentRevisionHref } from "./content-sections";

type SectionHistoryProps = {
  section: SectionKey;
  /** The section's revisions, newest first. */
  revisions: readonly RevisionSummary[];
  /** The revision the site shows now. */
  currentRevision: number;
  /** Who's looking, to say "You" for their own saves. */
  viewerId: string;
  now: Date;
  timeZone: string;
};

/** Who saved a revision, as the history says it. Account names aren't shown yet, so others are "Someone on the team". */
export function savedByLabel(revision: Pick<RevisionSummary, "savedBy" | "savedAt">, viewerId: string): string {
  if (revision.savedBy === null) return "The content the site started with";
  return revision.savedBy === viewerId ? "Saved by you" : "Saved by someone on the team";
}

/**
 * A section's history under its editor: every saved version, newest first,
 * each opening a read-only view with a way to put it back. Restoring never
 * rewrites history: it saves the old version again as a new revision.
 */
export function SectionHistory({ section, revisions, currentRevision, viewerId, now, timeZone }: SectionHistoryProps) {
  return (
    <Panel title="History" description="Every saved version of this section. Open one to see it, or to put it back." flush>
      {revisions.length === 0 ? (
        <p className="px-4 py-4 text-sm text-fg-2 lg:px-5">No earlier versions yet. Each time you save, the version is kept here.</p>
      ) : (
        <List label="Saved versions">
          {revisions.map((revision) => (
            <ListRow
              key={revision.revision}
              lead={`v${revision.revision}`}
              href={contentRevisionHref(section, revision.revision)}
              trailing={
                revision.revision === currentRevision ? (
                  <StatusPill tone="success">Live now</StatusPill>
                ) : revision.savedAt ? (
                  capitalised(whenLabel(revision.savedAt, now, timeZone))
                ) : (
                  "First version"
                )
              }
            >
              <span className="block text-sm text-fg">{savedByLabel(revision, viewerId)}</span>
              {revision.revision === currentRevision && revision.savedAt && (
                <span className="block text-xs text-fg-3">{capitalised(whenLabel(revision.savedAt, now, timeZone))}</span>
              )}
            </ListRow>
          ))}
        </List>
      )}
    </Panel>
  );
}
