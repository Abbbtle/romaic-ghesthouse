import { WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * How fresh the live diary is (design-spec §7.5). The transport (realtime or
 * polling) is invisible to visitors; only freshness matters.
 */
export const liveStates = ["live", "connecting", "reconnecting", "offline"] as const;

export type LiveState = (typeof liveStates)[number];

export const liveStateLabels: Record<LiveState, string> = {
  live: "Live",
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  offline: "Offline",
};

/** The 8 px dot with its ring. It pulses only while live, and never under reduced motion. Decorative. */
export function LiveDot({ state = "live", className }: { state?: LiveState; className?: string }) {
  return <span className={cx("live-dot", className)} data-state={state} aria-hidden="true" />;
}

const labelTones: Record<LiveState, string> = {
  live: "text-fg-brand",
  connecting: "text-fg-2",
  reconnecting: "text-warning-800",
  offline: "text-fg",
};

type LiveIndicatorProps = {
  state: LiveState;
  /** Replaces the state's own label, e.g. "Open this week". */
  label?: string;
  /**
   * The ticking freshness text, "Updated just now" or "Last updated 10:42".
   * It sits outside the status region, so only state changes are announced.
   */
  freshness?: ReactNode;
  /** A control beside it, such as the offline state's "Refresh" button. */
  action?: ReactNode;
  className?: string;
};

/**
 * The live diary's status: dot, label and freshness, as an inline group (no
 * pill). The label is a polite status region; state is never shown by colour
 * alone, since the label always names it. For white and chalk surfaces; a
 * navy band shows just a LiveDot beside its own words.
 */
export function LiveIndicator({ state, label, freshness, action, className }: LiveIndicatorProps) {
  return (
    <span className={cx("inline-flex flex-wrap items-center gap-x-2.5 gap-y-1", className)}>
      <span role="status" className="inline-flex items-center gap-2 text-sm font-medium">
        {state === "offline" ? (
          <WifiOff aria-hidden="true" strokeWidth={2} className="size-3.5 text-fg-3" />
        ) : (
          <LiveDot state={state} />
        )}
        <span className={labelTones[state]}>{label ?? liveStateLabels[state]}</span>
      </span>
      {freshness && <span className="text-sm text-fg-3">{freshness}</span>}
      {action}
    </span>
  );
}
