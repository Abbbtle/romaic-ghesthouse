import { cx } from "./cx";

/** md: 48 px. sm: 40 px (dashboard rows). */
export type AvatarSize = "md" | "sm";

const sizes: Record<AvatarSize, string> = { md: "size-12 text-base", sm: "size-10 text-sm" };

/** Up to two initials from a name: "Thandi Mokoena" → "TM", "Sales desk" → "SD". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1] ?? "") : "";
  return [first, last]
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toLocaleUpperCase("en-ZA");
}

type InitialsAvatarProps = {
  /** The person's name as written beside the avatar. */
  name: string;
  size?: AvatarSize;
  className?: string;
};

/**
 * A person shown by their initials, Cream on Midnight Navy with a thin gold
 * ring. Decorative: their name is always written beside it, so screen
 * readers skip it.
 */
export function InitialsAvatar({ name, size = "md", className }: InitialsAvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-midnight-navy font-display font-semibold tracking-wider text-cream ring-2 ring-romaic-gold ring-offset-2 ring-offset-canvas",
        sizes[size],
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
