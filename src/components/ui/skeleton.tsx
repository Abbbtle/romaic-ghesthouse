import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * A grey stub standing in for content that is loading, shaped like it (the
 * caller sizes it). It pulses gently, and stands still under reduced motion.
 */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cx("block animate-skeleton rounded-xs bg-skeleton motion-reduce:animate-none", className)} />;
}

type LoadingStatusProps = {
  /** What screen readers hear: "Loading…", or something more specific like "Loading your diary…". */
  label?: string;
  /** The skeleton: the same geometry as the content it stands for. */
  children: ReactNode;
  className?: string;
};

/**
 * A loading region (design-spec §11.4): nothing for the first 100 ms, so fast
 * answers never flash, then the skeleton. Screen readers hear the label once.
 */
export function LoadingStatus({ label = "Loading…", children, className }: LoadingStatusProps) {
  return (
    <div role="status" className={cx("appear-after-delay", className)}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
