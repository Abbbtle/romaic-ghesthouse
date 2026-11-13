import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./cx";

export type NoticeTone = "info" | "success" | "warning" | "danger";

/** How a notice is announced: polite (a status), assertive (an alert) or not at all (it was there on arrival). */
export type NoticeLive = "polite" | "assertive" | "off";

const looks: Record<NoticeTone, { frame: string; icon: string; glyph: LucideIcon; live: NoticeLive }> = {
  info: { frame: "bg-notice-info-bg text-notice-info-fg", icon: "text-notice-info-icon", glyph: Info, live: "polite" },
  success: { frame: "bg-notice-success-bg text-notice-success-fg", icon: "text-notice-success-icon", glyph: CircleCheck, live: "polite" },
  warning: { frame: "bg-notice-warning-bg text-notice-warning-fg", icon: "text-notice-warning-icon", glyph: TriangleAlert, live: "polite" },
  danger: { frame: "bg-notice-danger-bg text-notice-danger-fg", icon: "text-notice-danger-icon", glyph: CircleAlert, live: "assertive" },
};

const roles: Record<NoticeLive, "status" | "alert" | undefined> = { polite: "status", assertive: "alert", off: undefined };

type NoticeProps = {
  tone?: NoticeTone;
  /** A short first line in bold: "This time was just booked." */
  title?: ReactNode;
  children?: ReactNode;
  /** Defaults to assertive for danger and polite otherwise. */
  live?: NoticeLive;
  /** A button or link to fix the problem, such as "Refresh". */
  action?: ReactNode;
  className?: string;
};

/**
 * An inline message: a status ("Still open. We'll tell you if that changes."),
 * a warning or a failure ("Couldn't save your changes…"). Each tone has its
 * own icon shape as well as its colour, and every pairing passes AA.
 */
export function Notice({ tone = "info", title, children, live, action, className }: NoticeProps) {
  const look = looks[tone];
  const Glyph = look.glyph;
  return (
    <div role={roles[live ?? look.live]} className={cx("flex gap-2.5 rounded-sm px-3.5 py-3 text-sm", look.frame, className)}>
      <Glyph aria-hidden="true" strokeWidth={2} className={cx("mt-0.5 size-4 shrink-0", look.icon)} />
      <div className="min-w-0 flex-1">
        {title && <p className="font-bold">{title}</p>}
        {children && <div className={title ? "mt-0.5" : undefined}>{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}
