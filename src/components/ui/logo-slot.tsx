import { cx } from "./cx";

/**
 * Where the Romaic logo goes, until the client's logo files arrive.
 *
 * The brand guide (p4) forbids retyping the wordmark in a font, so nothing
 * here imitates it: the slot is a clearly marked placeholder at the logo's
 * size (the wordmark is about 3.4 times as wide as it is tall, and never
 * narrower than 240 px on screen). Swap it for the supplied PNG with next/image
 * once it arrives. `kind` picks the lockup: the wordmark alone, or the
 * primary lockup with corner marks A and B either side.
 */
export function LogoSlot({
  kind = "wordmark",
  tone = "light",
  decorative = false,
  className,
}: {
  kind?: "wordmark" | "lockup" | "corner-mark";
  /** light: on Cream or white. dark: on navy, where the wordmark must sit on a Cream plate. */
  tone?: "light" | "dark";
  /** Inside a link that already names the site ("Romaic Guesthouse, home"): hidden from screen readers. */
  decorative?: boolean;
  className?: string;
}) {
  const sizes = {
    wordmark: "w-60 aspect-[3.4/1]",
    lockup: "w-full max-w-72 sm:max-w-[26rem] aspect-[5.6/1]",
    "corner-mark": "w-[6.875rem] aspect-[2.4/1]",
  } as const;
  const label = { wordmark: "Romaic logo", lockup: "Romaic logo with corner marks", "corner-mark": "Corner mark" }[kind];
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : `${label} (logo files to come)`}
      aria-hidden={decorative ? true : undefined}
      data-placeholder="logo"
      className={cx(
        "inline-flex max-w-full shrink-0 flex-col items-center justify-center gap-0.5 border border-dashed px-3 text-center",
        tone === "dark" ? "border-romaic-gold bg-cream text-gold-text" : "border-gold-text/60 bg-white/60 text-gold-text",
        sizes[kind],
        className,
      )}
    >
      <span aria-hidden="true" className="font-display text-xs font-semibold tracking-[0.18em] uppercase">
        {kind === "corner-mark" ? "Mark" : "Logo"}
      </span>
      {kind !== "corner-mark" && (
        <span aria-hidden="true" className="text-xs leading-tight text-fg-3">
          Logo files to come
        </span>
      )}
    </span>
  );
}
