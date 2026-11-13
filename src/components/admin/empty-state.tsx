import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

/**
 * none: on its own. panel: in a level-1 frame (an empty list). floating: a
 * raised panel to centre over a grid that keeps its shape (an empty week).
 */
export type EmptyStateFrame = "none" | "panel" | "floating";

const frames: Record<EmptyStateFrame, string> = {
  none: "",
  panel: "rounded-md border border-hairline bg-white p-5 lg:p-7",
  floating: "max-w-md rounded-md border border-hairline bg-white p-5 shadow-2 lg:p-6",
};

type EmptyStateProps = {
  /** What's (not) here: "No requests yet". */
  title: string;
  /** One sentence on what will appear and how: "When clients request a time on your website, it shows up here." */
  children?: ReactNode;
  /** One or two verb-first actions: "Copy booking link". */
  actions?: ReactNode;
  /** An optional 24 px lucide icon. */
  icon?: ReactNode;
  frame?: EmptyStateFrame;
  className?: string;
};

/**
 * An empty or filtered-to-nothing state (design-spec §11.3): a headline, one
 * sentence of value and an action, left aligned. No illustrations.
 */
export function EmptyState({ title, children, actions, icon, frame = "panel", className }: EmptyStateProps) {
  return (
    <div className={cx(frames[frame], className)}>
      {icon && <span className="mb-3 inline-flex text-fg-3 [&_svg]:size-6 [&_svg]:stroke-[1.75]">{icon}</span>}
      <p className="text-h4 font-bold text-ink">{title}</p>
      {children && <p className="mt-1.5 max-w-[48ch] text-base text-fg-2">{children}</p>}
      {actions && <div className="mt-5 flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}
