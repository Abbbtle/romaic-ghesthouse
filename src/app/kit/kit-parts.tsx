import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

/** One part of the design preview: a title, what the part is for, and the specimens. */
export function KitSection({
  id,
  title,
  spec,
  tone = "canvas",
  children,
}: {
  id: string;
  title: string;
  spec?: ReactNode;
  tone?: "canvas" | "cream" | "white";
  children: ReactNode;
}) {
  const tones = { canvas: "bg-canvas", cream: "bg-cream", white: "bg-white" } as const;
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cx("scroll-mt-20 border-t border-hairline", tones[tone])}>
      <div className="mx-auto grid max-w-page gap-8 px-[max(1rem,env(safe-area-inset-left))] py-14">
        <div className="grid max-w-[68ch] gap-2">
          <h2 id={`${id}-title`} className="font-display text-h2 font-semibold tracking-[0.08em] text-ink uppercase">
            {title}
          </h2>
          {spec && <div className="text-base text-fg-2">{spec}</div>}
        </div>
        {children}
      </div>
    </section>
  );
}

/** A labelled example. */
export function Specimen({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <figure className={cx("grid content-start gap-3", className)}>
      <figcaption className="text-xs font-bold tracking-[0.08em] text-fg-3 uppercase">{label}</figcaption>
      <div className="min-w-0">{children}</div>
    </figure>
  );
}

/** A colour token: its chip, name, value, and where it may be used. */
export function Swatch({ name, token, value, use, ratio }: { name: string; token: string; value: string; use: string; ratio?: string }) {
  return (
    <div className="grid grid-cols-[3.5rem_1fr] items-start gap-3">
      <span aria-hidden="true" className="h-14 w-14 rounded-xs border border-hairline shadow-1" style={{ background: value }} />
      <div className="grid gap-0.5 text-sm">
        <p className="font-bold text-ink">{name}</p>
        <p className="font-mono text-xs text-fg-2" data-numeric>
          {value} · {token}
        </p>
        <p className="text-fg-3">{use}</p>
        {ratio && <p className="text-xs font-bold text-success-700">{ratio}</p>}
      </div>
    </div>
  );
}

/** The switch between the public and dashboard views, and the contents. */
export function KitHeader({ view, sections }: { view: "public" | "admin"; sections: readonly { id: string; label: string }[] }) {
  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-30 border-b border-hairline bg-white">
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-6 gap-y-2 px-[max(1rem,env(safe-area-inset-left))] py-3">
        <p className="font-display text-sm font-semibold tracking-[0.16em] text-ink uppercase">Romaic design system</p>
        <nav aria-label="Views" className="flex gap-1 rounded-sm bg-wash p-1">
          {(
            [
              ["public", "/kit", "Public site"],
              ["admin", "/kit?view=admin", "Dashboard"],
            ] as const
          ).map(([key, href, label]) => (
            <Link
              key={key}
              href={href}
              aria-current={view === key ? "page" : undefined}
              className={cx(
                "inline-flex min-h-11 items-center rounded-xs px-3 text-sm font-bold",
                view === key ? "bg-white text-ink shadow-1" : "text-fg-2 hover:text-ink",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        <nav aria-label="On this page" className="scrollbar-none -mx-1 flex max-w-full gap-1 overflow-x-auto">
          {sections.map((section) => (
            <a key={section.id} href={`#${section.id}`} className="inline-flex min-h-11 shrink-0 items-center rounded-xs px-2 text-sm text-fg-2 hover:bg-wash hover:text-ink">
              {section.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
