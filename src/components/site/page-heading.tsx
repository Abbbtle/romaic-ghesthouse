import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { Paragraphs } from "@/components/ui/paragraphs";
import { siteText } from "./site-type";

/**
 * The top of an inner page, the way the approved design heads a section:
 * the page's line large in Josefin Sans light (its h1) on the left, and the
 * introduction with anything the page adds (the booking button, the
 * address, the WhatsApp and call buttons) on the right, both resting on the
 * same baseline. On phones and tablets they stack. With nothing beside it
 * the heading stands alone.
 */
export function PageHeading({ title, intro, children, className }: { title: string; intro?: string; children?: ReactNode; className?: string }) {
  const beside = Boolean(intro) || Boolean(children);
  return (
    <div className={cx("grid gap-x-16 gap-y-6", beside && "min-[56.25rem]:grid-cols-2 min-[56.25rem]:items-end", className)}>
      <h1 className={siteText.page}>{title}</h1>
      {beside && (
        <div className="grid justify-items-start gap-6 min-[56.25rem]:justify-self-end">
          {intro && <Paragraphs text={intro} className={siteText.lede} />}
          {children}
        </div>
      )}
    </div>
  );
}

const tones = { paper: "bg-paper", cream: "bg-cream", navy: "on-dark bg-midnight-navy text-fg" } as const;

const spacings = {
  /** The page's heading, under the header. */
  head: "pt-[clamp(3rem,7vw,5.5rem)] pb-[clamp(2.5rem,5vw,4rem)]",
  /** The body that follows a heading or another band on the same ground. */
  body: "pb-band-sm",
  /** A band of its own on a different ground. */
  band: "py-band-sm",
} as const;

/** A page's content width, side gutters and vertical rhythm, the same on every public page. */
export function PageBand({
  children,
  className,
  tone = "paper",
  spacing = "body",
}: {
  children: ReactNode;
  className?: string;
  tone?: keyof typeof tones;
  spacing?: keyof typeof spacings;
}) {
  return (
    <div className={tones[tone]}>
      <div className={cx("site-wrap", spacings[spacing], className)}>{children}</div>
    </div>
  );
}
