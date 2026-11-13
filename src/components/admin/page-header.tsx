import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The phone back link, looking like an icon button (ui/icon-button.tsx). The
 * classes are written out here: that module is a client one, so its
 * iconButtonClasses can't be called while this renders on the server.
 */
const backLinkClasses =
  "relative -ml-2.5 inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-fg-2 transition-colors duration-150 hover:bg-neutral-100 hover:text-fg active:bg-neutral-200 [&_svg]:size-5 [&_svg]:stroke-[1.75]";

type PageHeaderProps = {
  /** The page's name: its h1. "Today", "Requests", "Edit testimonial". */
  title: string;
  /** One sentence on what the page is for. */
  description?: ReactNode;
  /** The page's primary action, e.g. "New entry". Beside the title from 1024 px, under the description on phones. */
  actions?: ReactNode;
  /** One small thing in the phone app bar, opposite the title: a date, a "Today" button or an icon button. */
  barAction?: ReactNode;
  /** A link back up a level, e.g. from a testimonial to the list. */
  back?: { href: string; label: string };
};

/**
 * The top of a dashboard page (design-spec §10.1). On phones the title is a
 * 56 px app bar that stays at the top while the page scrolls; from 1024 px it
 * is a large heading with its sentence and action. Put it first in the page,
 * directly in the shell's <main>: the bar sticks within main and bleeds over
 * its 16 px padding.
 */
export function PageHeader({ title, description, actions, barAction, back }: PageHeaderProps) {
  return (
    <>
      <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-4 flex h-14 items-center justify-between gap-3 border-b border-hairline bg-white px-4 lg:hidden">
        <div className="flex min-w-0 items-center gap-1">
          {back && (
            <Link href={back.href} aria-label={back.label} className={backLinkClasses}>
              <ChevronLeft aria-hidden="true" />
            </Link>
          )}
          <h1 className="truncate text-h3 font-bold text-ink">{title}</h1>
        </div>
        {barAction && <div className="flex shrink-0 items-center">{barAction}</div>}
      </div>

      <div className="mb-6 flex flex-col gap-4 lg:mb-8 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="min-w-0">
          {back && (
            <Link
              href={back.href}
              className="mb-2 hidden min-h-9 items-center gap-1 text-sm font-medium text-link underline-offset-4 hover:underline lg:inline-flex"
            >
              <ChevronLeft aria-hidden="true" strokeWidth={2} className="size-4" />
              {back.label}
            </Link>
          )}
          <h1 className="hidden text-h2 font-bold text-ink lg:block">{title}</h1>
          {description && <p className="max-w-[62ch] text-base text-fg-2 lg:mt-2">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </>
  );
}
