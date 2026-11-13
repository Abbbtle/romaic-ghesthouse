import { formatDateShort } from "@/lib/format/date-time";
import { daysBetween, type IsoDate } from "@/lib/format/zoned-time";
import { breachStatusNames, requestStatusNames, urgencyOf, type BreachStatus, type RequestStatus } from "@/lib/privacy/privacy";
import type { LegalPoint } from "@/lib/privacy/sources";
import { ExternalLink } from "@/components/ui/external-link";
import { StatusPill, type StatusTone } from "../status-pill";

const requestTones: Record<RequestStatus, StatusTone> = { received: "warning", "in-progress": "info", answered: "success", refused: "neutral" };

export function RequestStatusPill({ status }: { status: RequestStatus }) {
  return <StatusPill tone={requestTones[status]}>{requestStatusNames[status]}</StatusPill>;
}

const breachTones: Record<BreachStatus, StatusTone> = { ongoing: "danger", contained: "success" };

export function BreachStatusPill({ status }: { status: BreachStatus }) {
  return <StatusPill tone={breachTones[status]}>{breachStatusNames[status]}</StatusPill>;
}

/** When an open request is due, in words: "Late: was due 1 Nov 2026", "Due in 3 days (16 Nov 2026)", or when it closed. */
export function dueText(request: { status: RequestStatus; dueOn: IsoDate; closedOn: IsoDate | null }, today: IsoDate): { text: string; tone: StatusTone } {
  const urgency = urgencyOf(request, today);
  if (urgency === "closed") return { text: `${requestStatusNames[request.status]} ${request.closedOn ? formatDateShort(request.closedOn) : ""}`.trim(), tone: "neutral" };
  if (urgency === "overdue") return { text: `Late: was due ${formatDateShort(request.dueOn)}`, tone: "danger" };
  const days = daysBetween(today, request.dueOn);
  const when = days === 0 ? "Due today" : days === 1 ? "Due tomorrow" : `Due in ${days} days`;
  return { text: `${when} (${formatDateShort(request.dueOn)})`, tone: urgency === "due-soon" ? "warning" : "neutral" };
}

/**
 * What the website's privacy notice shows of the Information Officer, in
 * words. The notice (src/app/(site)/privacy/page.tsx) shows the name and
 * email, the phone and Regulator registration reference when they're
 * recorded, and a marked gap while no officer is set.
 */
export function officerOnNoticeText(officer: { phone: string | null; registrationReference: string | null } | null): string {
  if (!officer) return "The privacy notice shows a gap here until you add them.";
  const shown = ["name", "email", ...(officer.phone ? ["phone"] : []), ...(officer.registrationReference ? ["Regulator registration reference"] : [])];
  return `The privacy notice on the website shows the ${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}.`;
}

/** A duty or timeframe from the Act or the Regulator, with where it was read and when (src/lib/privacy/sources.ts). */
export function LegalPointText({ point }: { point: LegalPoint }) {
  return (
    <p className="text-sm text-fg-2">
      <span className="font-bold text-ink">{point.section}:</span> {point.text}{" "}
      <span className="whitespace-nowrap">
        (<ExternalLink href={point.source.url}>source</ExternalLink>, checked {formatDateShort(point.source.checkedOn)})
      </span>
    </p>
  );
}
