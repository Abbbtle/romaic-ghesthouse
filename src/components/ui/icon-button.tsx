"use client";

import { useState, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./cx";
import { newTabHint } from "./visually-hidden";

export type IconButtonTone = "default" | "on-dark";

type IconButtonStyle = {
  tone?: IconButtonTone;
  /** md is 44 × 44; sm is 36 × 36 with a 44 px hit area, for pointer-first admin toolbars. */
  size?: "md" | "sm";
  /** square has the 6 px corners; pill is round, the public site's pressable shape. */
  shape?: "square" | "pill";
};

const tones: Record<IconButtonTone, string> = {
  default: "text-fg-2 hover:bg-wash hover:text-fg active:bg-wash-strong",
  "on-dark": "text-white hover:bg-white/10 focus-visible:outline-white",
};

/** The classes for an icon button, for a Link that must look like one. */
export function iconButtonClasses({ tone = "default", size = "md", shape = "square" }: IconButtonStyle, className?: string): string {
  return cx(
    "relative inline-flex shrink-0 items-center justify-center rounded-sm transition-colors duration-150 [&_svg]:size-5 [&_svg]:stroke-[1.75] aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
    size === "md" ? "size-11" : "size-9 after:absolute after:-inset-1",
    shape === "pill" && "rounded-pill",
    tones[tone],
    className,
  );
}

type TooltipPlacement = {
  /** Which side of the button the tooltip appears on. */
  side?: "bottom" | "top";
  /** Line the tooltip up with the button's start, centre or end, to keep it on screen near edges. */
  align?: "start" | "center" | "end";
};

const sides = { bottom: "top-full mt-1.5", top: "bottom-full mb-1.5" } as const;
const aligns = { start: "left-0", center: "left-1/2 -translate-x-1/2", end: "right-0" } as const;

/**
 * A custom tooltip naming an icon button, shown on hover and keyboard focus
 * (never `title`, which touch and keyboard users don't get). The name itself
 * is the button's aria-label, so the tooltip is hidden from screen readers.
 * Escape dismisses it without moving focus (WCAG 1.4.13).
 */
function WithTooltip({ text, side = "bottom", align = "center", children }: TooltipPlacement & { text: string; children: ReactNode }) {
  const [dismissed, setDismissed] = useState(false);
  const dismissOnEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape" && !dismissed) setDismissed(true);
  };
  const restore = () => setDismissed(false);

  return (
    <span className="group/tip relative inline-flex" onKeyDown={dismissOnEscape} onBlur={restore} onPointerLeave={restore}>
      {children}
      <span
        aria-hidden="true"
        className={cx(
          "pointer-events-none absolute z-[100] rounded-xs bg-tooltip px-2 py-1 text-xs font-medium whitespace-nowrap text-on-tooltip opacity-0 shadow-2 transition-opacity duration-150",
          "group-hover/tip:opacity-100 group-hover/tip:delay-300 group-has-focus-visible/tip:opacity-100 group-has-focus-visible/tip:delay-0",
          dismissed && "invisible",
          sides[side],
          aligns[align],
        )}
      >
        {text}
      </span>
    </span>
  );
}

type IconButtonProps = IconButtonStyle &
  TooltipPlacement &
  Omit<ComponentProps<"button">, "children" | "aria-label"> & {
    /** The accessible name and the tooltip: "Close", "Move up", "Open menu". */
    label: string;
    icon: ReactNode;
  };

/** A 44 × 44 button showing only an icon, named by its tooltip. */
export function IconButton({ label, icon, tone, size, shape, side, align, className, type = "button", ...buttonProps }: IconButtonProps) {
  return (
    <WithTooltip text={label} side={side} align={align}>
      <button {...buttonProps} type={type} aria-label={label} className={iconButtonClasses({ tone, size, shape }, className)}>
        {icon}
      </button>
    </WithTooltip>
  );
}

type IconLinkButtonProps = IconButtonStyle &
  TooltipPlacement &
  Omit<ComponentProps<"a">, "children" | "aria-label" | "target"> & {
    href: string;
    label: string;
    icon: ReactNode;
    /** Opens in a new tab; screen readers hear "(opens in a new tab)", or `hint` when given. */
    external?: boolean;
    /** What screen readers hear after the label, e.g. "(opens WhatsApp)". */
    hint?: string;
  };

/** An icon button that is a link: a social profile, a WhatsApp chat, a phone call. */
export function IconLinkButton({ href, label, icon, external = false, hint, tone, size, shape, side, align, className, ...anchorProps }: IconLinkButtonProps) {
  const spokenHint = hint ?? (external ? newTabHint : undefined);
  return (
    <WithTooltip text={label} side={side} align={align}>
      <a
        {...anchorProps}
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : anchorProps.rel}
        aria-label={spokenHint ? `${label} ${spokenHint}` : label}
        className={iconButtonClasses({ tone, size, shape }, className)}
      >
        {icon}
      </a>
    </WithTooltip>
  );
}
