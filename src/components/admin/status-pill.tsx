import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

// Every pairing passes 4.5:1 (design-spec §2.4).
const tones: Record<StatusTone, string> = {
  neutral: "bg-neutral-100 text-neutral-800",
  success: "bg-success-50 text-success-800",
  warning: "bg-warning-50 text-warning-800",
  danger: "bg-danger-50 text-danger-700",
  info: "bg-info-50 text-info-800",
};

type StatusPillProps = {
  tone?: StatusTone;
  /** An optional 14 px icon, such as Repeat for a weekly session. */
  icon?: ReactNode;
  /** The status in words, "Waiting", "Accepted", "Slot taken": the words carry the meaning, the colour only helps. */
  children: ReactNode;
  className?: string;
};

/** A record's status as a small tag. */
export function StatusPill({ tone = "neutral", icon, children, className }: StatusPillProps) {
  return (
    <span
      className={cx(
        "inline-flex h-6 w-fit items-center gap-1 rounded-xs px-2 text-xs font-medium whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0",
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
