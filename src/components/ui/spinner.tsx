import { cx } from "./cx";

/**
 * A 16 px spinner for a control that is working. It is decorative: the
 * control's own text says what is happening ("Saving…"). Under reduced motion
 * it stands still.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false" className={cx("size-4 shrink-0 animate-spin", className)}>
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.75" />
      <path d="M14.25 8A6.25 6.25 0 0 0 8 1.75" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
