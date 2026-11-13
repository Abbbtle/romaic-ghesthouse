"use client";

import { Menu, Phone, X } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { VisuallyHidden, whatsappHint } from "@/components/ui/visually-hidden";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";
import { IconButton } from "@/components/ui/icon-button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useRef, useState } from "react";
import { isCurrent } from "./header-nav";
import type { SiteFacts } from "./site-facts";

export type SiteNavLink = { href: string; label: string };

/**
 * The phone menu, below 1200 px: a native modal dialog (focus moves in,
 * Escape closes, the page behind is inert), opened from a 44 px "Menu"
 * button set off by a gold hairline, as in the approved mock-up. A navy
 * panel with a gold top edge, the pages in Josefin Sans, and the gold
 * booking button and the contact details at the foot, so a guest can book
 * from the menu itself. The button says whether the menu is open
 * (aria-expanded), however it closes: a link, the close button, Escape or a
 * tap beside it.
 */
export function MobileMenu({ links, facts, bookHref }: { links: readonly SiteNavLink[]; facts: Pick<SiteFacts, "phone" | "email" | "whatsapp">; bookHref?: string }) {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogId = useId();
  const [open, setOpen] = useState(false);
  const close = () => dialog.current?.close();
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
        }}
        className="-mr-1 inline-flex min-h-11 items-center gap-2 border-l border-romaic-gold/50 pr-1 pl-4 font-display text-nav tracking-[0.04em] text-fg transition-colors hover:text-romaic-gold aria-expanded:text-romaic-gold min-[75rem]:hidden"
      >
        Menu
        <Menu aria-hidden="true" strokeWidth={1.5} className="size-5" />
      </button>
      <dialog
        ref={dialog}
        id={dialogId}
        onClose={() => setOpen(false)}
        aria-label="Menu"
        // Tapping the dimmed page beside the panel closes it, as people expect of a side menu.
        closedby="any"
        className="on-dark m-0 ml-auto h-dvh max-h-none w-[min(22rem,100vw)] max-w-none border-t-2 border-romaic-gold bg-midnight-navy p-0 text-fg shadow-3 backdrop:bg-backdrop"
      >
        <div className="flex h-full flex-col overflow-y-auto px-6 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="flex justify-end">
            <IconButton label="Close menu" icon={<X />} align="end" tone="on-dark" onClick={close} className="-mr-2.5" autoFocus />
          </div>
          <nav aria-label="Main" className="mt-2">
            <ul className="grid">
              {links.map((link) => (
                <li key={link.href} className="border-b border-hairline">
                  <Link
                    href={link.href}
                    onClick={close}
                    aria-current={isCurrent(link.href, pathname) ? "page" : undefined}
                    className="flex min-h-14 items-center font-display text-xl font-light tracking-[0.01em] text-fg transition-colors hover:text-romaic-gold aria-[current=page]:text-romaic-gold"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-auto grid gap-3 pt-8 text-[0.9375rem]">
            {bookHref && (
              <Link href={bookHref} onClick={close} className={buttonClasses({ variant: "gold", size: "lg", fullWidth: true })}>
                Check availability
              </Link>
            )}
            <div className="grid grid-cols-2 gap-3">
              <a href={facts.whatsapp} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "on-dark-secondary", size: "md", fullWidth: true })}>
                <WhatsAppGlyph tone="mono" className="size-4" />
                WhatsApp
                <VisuallyHidden>{whatsappHint}</VisuallyHidden>
              </a>
              <a href={facts.phone.tel} className={buttonClasses({ variant: "on-dark-secondary", size: "md", fullWidth: true })}>
                <Phone aria-hidden="true" strokeWidth={1.5} className="size-4" />
                Call
              </a>
            </div>
            <a href={`mailto:${facts.email}`} className="inline-flex min-h-11 items-center break-all text-fg-2 underline-offset-4 hover:text-fg hover:underline">
              {facts.email}
            </a>
          </div>
        </div>
      </dialog>
    </>
  );
}
