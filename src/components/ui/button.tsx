import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { cx } from "./cx";
import { Spinner } from "./spinner";
import { newTabHint, VisuallyHidden } from "./visually-hidden";

/**
 * Button looks (design-spec §6.3). Primary is the one main action in a view;
 * the on-dark variants sit on the navy contact bar and dark panels; danger is for confirm dialogs.
 * Ghost reads as a link, for inline actions like "See 1:1 pricing".
 */
export const buttonVariants = [
  "primary",
  "secondary",
  "ghost",
  "ghost-danger",
  "danger",
  "whatsapp",
  "on-dark",
  "on-dark-secondary",
  "whatsapp-on-dark",
] as const;

export type ButtonVariant = (typeof buttonVariants)[number];

/** lg is 52 px (public phone CTAs), md 44 px (the default), sm 36 px with a 44 px hit area (admin toolbars). */
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonStyle = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretches the button across its container, as phone CTAs do. */
  fullWidth?: boolean;
};

// Every look has a 1.5 px border, so all buttons share one height; looks without
// a visible edge make it transparent (it shows in forced-colours mode). Each
// variant sets its own border colour: two colour utilities on one element
// would leave the winner to the stylesheet's order.
const base =
  "relative inline-flex items-center justify-center gap-2 rounded-sm border-[1.5px] font-bold leading-tight whitespace-nowrap select-none [transition:color_150ms,background-color_150ms,border-color_150ms,scale_100ms] motion-safe:active:scale-[.98] aria-busy:cursor-progress aria-disabled:not-aria-busy:cursor-not-allowed aria-disabled:not-aria-busy:opacity-50";

const heights: Record<ButtonSize, string> = {
  lg: "h-13 text-base",
  md: "h-11 text-base",
  // The visible button is 36 px; the hit area reaches 44 px.
  sm: "h-9 text-sm after:absolute after:-inset-1",
};

const paddings: Record<ButtonSize, string> = { lg: "px-5.5", md: "px-4.5", sm: "px-3.5" };

const variants: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-active",
  secondary: "border-btn-secondary-border bg-btn-secondary-bg text-btn-secondary-fg hover:bg-btn-secondary-hover active:bg-btn-secondary-active",
  ghost: "border-transparent text-link underline decoration-1 underline-offset-4 hover:text-link-hover hover:decoration-2",
  "ghost-danger": "border-transparent text-danger-700 underline decoration-1 underline-offset-4 hover:text-danger-800 hover:decoration-2",
  danger: "border-transparent bg-danger-600 text-white hover:bg-danger-700 active:bg-danger-800",
  whatsapp: "border-transparent bg-btn-whatsapp-bg text-btn-whatsapp-fg hover:bg-btn-whatsapp-hover",
  "on-dark": "border-transparent bg-cream text-midnight-navy hover:bg-white active:bg-neutral-50 focus-visible:outline-champagne",
  "on-dark-secondary": "border-cream/70 text-white hover:bg-white/10 focus-visible:outline-champagne",
  "whatsapp-on-dark": "border-cream/70 text-white hover:bg-white/10 focus-visible:outline-champagne",
};

/** Ghost buttons read as links, so they line up with the text around them. */
const unpadded = new Set<ButtonVariant>(["ghost", "ghost-danger"]);

/**
 * The classes for a button look, for the rare control that can't use Button,
 * ButtonLink or ButtonAnchor. `className` is for placing the button (margins,
 * width, auto margins), not for changing its look: two utilities for the same
 * property don't override each other in the order they're written.
 */
export function buttonClasses({ variant = "primary", size = "md", fullWidth = false }: ButtonStyle, className?: string): string {
  return cx(base, heights[size], unpadded.has(variant) ? "px-0" : paddings[size], variants[variant], fullWidth && "w-full", className);
}

const iconSizes: Record<ButtonSize, string> = { lg: "[&>svg]:size-5", md: "[&>svg]:size-5", sm: "[&>svg]:size-4" };

type ContentProps = {
  size: ButtonSize;
  /** A leading icon, such as a lucide icon or a brand glyph. */
  icon?: ReactNode;
  /** A trailing icon, such as a chevron. */
  iconEnd?: ReactNode;
  children: ReactNode;
};

function IconSlot({ size, children }: { size: ButtonSize; children: ReactNode }) {
  return <span className={cx("inline-flex shrink-0 [&>svg]:stroke-[1.75]", iconSizes[size])}>{children}</span>;
}

function Label({ size, icon, iconEnd, children }: ContentProps) {
  return (
    <>
      {icon && <IconSlot size={size}>{icon}</IconSlot>}
      {children}
      {iconEnd && <IconSlot size={size}>{iconEnd}</IconSlot>}
    </>
  );
}

/**
 * The label and, while working, a spinner with the working label in the same
 * grid cell, so the button keeps its width as one replaces the other.
 */
function WorkingLabel({ pending, pendingLabel, ...content }: ContentProps & { pending: boolean; pendingLabel?: ReactNode }) {
  return (
    <span className="grid place-items-center">
      <span className={cx("col-start-1 row-start-1 inline-flex items-center gap-2", pending && "invisible")}>
        <Label {...content} />
      </span>
      <span className={cx("col-start-1 row-start-1 inline-flex items-center gap-2", !pending && "invisible")}>
        <Spinner />
        {pendingLabel ?? content.children}
      </span>
    </span>
  );
}

const ignoreClick = (event: MouseEvent) => event.preventDefault();

type ButtonProps = ButtonStyle &
  Omit<ComponentProps<"button">, "children"> & {
    icon?: ReactNode;
    iconEnd?: ReactNode;
    /**
     * Working: a spinner replaces the icon, the label becomes `pendingLabel`
     * ("Saving…"), and clicks are ignored. The button stays focusable and is
     * never disabled (design-spec §11.1). Set from client components only.
     */
    pending?: boolean;
    pendingLabel?: ReactNode;
    children: ReactNode;
  };

/** A native button, for actions: submitting a form, opening a sheet. */
export function Button({
  variant,
  size = "md",
  fullWidth,
  icon,
  iconEnd,
  pending,
  pendingLabel,
  className,
  type = "button",
  onClick,
  children,
  ...buttonProps
}: ButtonProps) {
  const supportsPending = pending !== undefined;
  return (
    <button
      {...buttonProps}
      type={type}
      aria-busy={pending || undefined}
      aria-disabled={pending || buttonProps["aria-disabled"] || undefined}
      onClick={pending ? ignoreClick : onClick}
      className={buttonClasses({ variant, size, fullWidth }, className)}
    >
      {supportsPending ? (
        <WorkingLabel size={size} icon={icon} iconEnd={iconEnd} pending={pending} pendingLabel={pendingLabel}>
          {children}
        </WorkingLabel>
      ) : (
        <Label size={size} icon={icon} iconEnd={iconEnd}>
          {children}
        </Label>
      )}
    </button>
  );
}

type ButtonLinkProps = ButtonStyle &
  Omit<ComponentProps<typeof Link>, "children" | "className"> & {
    icon?: ReactNode;
    iconEnd?: ReactNode;
    className?: string;
    children: ReactNode;
  };

/** A link to a page of this site (or an anchor on one), styled as a button. */
export function ButtonLink({ variant, size = "md", fullWidth, icon, iconEnd, className, children, ...linkProps }: ButtonLinkProps) {
  return (
    <Link {...linkProps} className={buttonClasses({ variant, size, fullWidth }, className)}>
      <Label size={size} icon={icon} iconEnd={iconEnd}>
        {children}
      </Label>
    </Link>
  );
}

type ButtonAnchorProps = ButtonStyle &
  Omit<ComponentProps<"a">, "children" | "target"> & {
    href: string;
    icon?: ReactNode;
    iconEnd?: ReactNode;
    /** Opens in a new tab, with an arrow and "(opens in a new tab)" for screen readers. */
    external?: boolean;
    children: ReactNode;
  };

/**
 * A plain link styled as a button, for addresses that aren't pages of this
 * site: tel:, mailto:, maps and other websites.
 */
export function ButtonAnchor({ variant, size = "md", fullWidth, icon, iconEnd, external = false, className, children, ...anchorProps }: ButtonAnchorProps) {
  return (
    <a
      {...anchorProps}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : anchorProps.rel}
      className={buttonClasses({ variant, size, fullWidth }, className)}
    >
      <Label size={size} icon={icon} iconEnd={iconEnd ?? (external ? <ArrowUpRight aria-hidden="true" /> : undefined)}>
        {children}
        {external && (
          <>
            {" "}
            <VisuallyHidden>{newTabHint}</VisuallyHidden>
          </>
        )}
      </Label>
    </a>
  );
}
