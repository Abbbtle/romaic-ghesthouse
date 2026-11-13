import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { StatusPill } from "@/components/admin/status-pill";
import { ParameterSheet } from "@/components/admin/tax/parameter-sheet";
import { TaxTabs } from "@/components/admin/tax/tax-tabs";
import { ExternalLink } from "@/components/ui/external-link";
import { Notice } from "@/components/ui/notice";
import { formatDateShort } from "@/lib/format/date-time";
import { centsForInput } from "@/lib/format/money";
import { checkedText, describeValue, isBuildSeeded, parameterCatalogue, type ParameterCode, type ParameterLookup, type TaxParameter } from "@/lib/tax/parameters";
import { whatItBlocks } from "@/lib/tax/returns";
import { requireDashboardActor } from "@/server/admin-session";
import { taxService } from "@/server/tax";
import { addParameterVersion } from "../actions";

export const metadata: Metadata = { title: "Tax rates and dates" };

/** A version's value as the form shows it for editing. */
function editableValue(parameter: TaxParameter | null): string {
  if (!parameter || parameter.value === null) return "";
  if (parameter.unit === "cents" && typeof parameter.value === "number") return centsForInput(parameter.value);
  if (parameter.unit === "percent" || parameter.unit === "years") return String(parameter.value);
  return JSON.stringify(parameter.value, null, 2);
}

const span = (parameter: TaxParameter) => (parameter.effectiveTo ? `applies ${formatDateShort(parameter.effectiveFrom)} to ${formatDateShort(parameter.effectiveTo)}` : `applies from ${formatDateShort(parameter.effectiveFrom)}`);

/** Why a parameter has no usable value today, and what that stops, in one statement. */
function problemText(code: ParameterCode, lookup: Extract<ParameterLookup<ParameterCode>, { status: "missing" }>): string {
  const blocks = whatItBlocks(code);
  if (lookup.reason === "none") return `No version covers today. ${blocks}`;
  if (lookup.reason === "invalid") return `The app can't read this version: add a corrected one. ${blocks}`;
  return blocks;
}

const disclosureSummary = "min-h-11 cursor-pointer py-2 font-medium text-link";

/** One version: its dates, who checked it on sars.gov.za and when, the page, and (folded away) what the page says. */
function VersionDetails({ parameter }: { parameter: TaxParameter }) {
  return (
    <div className="grid gap-1 text-sm">
      <p className="text-fg-2">
        Version {parameter.version} · {span(parameter)}
      </p>
      <p className="text-fg-2">{checkedText(parameter)}</p>
      <p>
        {/* On a line of its own, so it gets a full-height target (WCAG 2.5.8); the links inside sentences elsewhere are inline. */}
        <ExternalLink href={parameter.sourceUrl} className="inline-flex min-h-6 items-center">
          {parameter.sourceTitle}
        </ExternalLink>
      </p>
      <details>
        <summary className={disclosureSummary}>{parameter.status === "verified" ? "What the page says" : "Why it isn't verified"}</summary>
        <p className="max-w-prose pb-2 text-fg-2">{parameter.note}</p>
      </details>
    </div>
  );
}

/**
 * Every tax rate, threshold and due date the app uses (Pattern: settings),
 * each with the sars.gov.za page it was read on, the day it was checked and
 * whether it's verified. A change is a new version, never an edit; a return
 * that needs a value that isn't verified is refused. Owner only.
 */
export default async function TaxParametersPage() {
  const actor = await requireDashboardActor({ permission: "tax:manage" });
  const { today, states } = await taxService().parameters(actor);
  const fromTheBuild = states.some(({ current }) => current !== null && isBuildSeeded(current));

  return (
    <>
      <PageHeader
        title="Rates and dates"
        description="Every tax rate, threshold and due date the app uses, each read on sars.gov.za on the day shown. When SARS changes one, add a new version from its page; the old one stays."
      />
      <TaxTabs current="parameters" />
      <div className="grid max-w-admin gap-6">
        {fromTheBuild && (
          <Notice tone="info" live="off" title="These were checked on sars.gov.za when the app was built">
            Ask your accountant to confirm them before relying on a return.
          </Notice>
        )}
        <Panel flush>
          <ul className="divide-y divide-hairline">
            {states.map(({ code, current, lookup, versions }) => {
              const entry = parameterCatalogue[code];
              const older = versions.filter((version) => version.id !== current?.id);
              return (
                <li key={code} className="grid gap-2 px-4 py-4 lg:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-x-4">
                    <p className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-bold text-ink">{entry.name}</span>
                      {lookup.status === "verified" ? <StatusPill tone="success">Verified</StatusPill> : <StatusPill tone="warning">{current ? "Not verified" : "No value"}</StatusPill>}
                    </p>
                    <ParameterSheet code={code} name={entry.name} unit={entry.unit} currentValue={editableValue(current)} today={today} action={addParameterVersion} />
                  </div>
                  <p className="text-sm text-fg-3">{entry.about}</p>
                  {current && current.value !== null && <p className="text-base font-medium text-ink tabular-nums">{describeValue(code, current.value)}</p>}
                  {lookup.status === "missing" && <p className="text-sm font-medium text-warning-800">{problemText(code, lookup)}</p>}
                  {current && <VersionDetails parameter={current} />}
                  {older.length > 0 && (
                    <details className="text-sm">
                      <summary className={disclosureSummary}>{older.length === 1 ? "One other version" : `${older.length} other versions`}</summary>
                      <ul className="mt-2 grid gap-4 border-l border-hairline pl-4">
                        {older.map((version) => (
                          <li key={version.id} className="grid gap-1">
                            <p className="font-medium text-ink">{describeValue(code, version.value)}</p>
                            <VersionDetails parameter={version} />
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </>
  );
}
