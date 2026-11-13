import type { SectionData, SectionKey } from "@/lib/content/schema";
import { Panel } from "../panel";
import { revisionFields } from "./revision-fields";

/** An earlier version of a section, field by field, read-only. */
export function RevisionView<K extends SectionKey>({ section, data }: { section: K; data: SectionData<K> }) {
  return (
    <Panel title="What this version says">
      <dl className="grid gap-4">
        {revisionFields(section, data).map((field) => (
          <div key={field.label} className="grid gap-1 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
            <dt className="text-sm font-medium text-fg-2">{field.label}</dt>
            <dd className={field.multiline ? "text-sm whitespace-pre-wrap text-fg [overflow-wrap:anywhere]" : "text-sm text-fg [overflow-wrap:anywhere]"}>
              {field.value === "" ? <span className="text-fg-3">Not filled in</span> : field.value}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
