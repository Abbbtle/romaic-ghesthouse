"use client";

import { CalendarDays, Menu, Phone, X } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { VisuallyHidden, whatsappHint } from "@/components/ui/visually-hidden";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";
import { IconButton } from "@/components/ui/icon-button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { isCurrent } from "./header-nav";
import type { SiteFacts } from "./site-facts";

export type SiteNavLink = { href: string; label: string };

/**
 * The phone menu: a native modal dialog (focus moves in, Escape closes, the
 * page behind is inert), opened from a 44 px button. Cream panel, Josefin
 * capitals, and the contact details at the foot so a guest can book from the
 * menu itself.
 */
export function MobileMenu({ links, facts, bookHref }: { links: readonly SiteNavLink[]; facts: Pick<SiteFacts, "phone" | "email" | "whatsapp">; bookHref?: string }) {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();
  return (
    <>
      <IconButton
        label="Open menu"
        icon={<Menu />}
        align="end"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
        className="text-ink xl:hidden"
      />
      <dialog
        ref={dialog}
        aria-label="Menu"
        // Tapping the dimmed page beside the panel closes it, as people expect of a side menu.
        closedby="any"
        className="m-0 ml-auto h-dvh max-h-none w-[min(22rem,100vw)] max-w-none bg-cream p-0 text-ink shadow-3 backdrop:bg-backdrop"
      >
        <div className="flex h-full flex-col px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="flex justify-end">
            <IconButton label="Close menu" icon={<X />} align="end" onClick={close} className="text-ink" autoFocus />
          </div>
          <nav aria-label="Main" className="mt-4">
            <ul className="grid">
              {links.map((link) => (
                <li key={link.href} className="border-b border-hairline">
                  <Link
                    href={link.href}
                    onClick={close}
                    aria-current={isCurrent(link.href, pathname) ? "page" : undefined}
                    className="flex min-h-14 items-center font-display text-lg font-semibold tracking-[0.12em] uppercase hover:text-gold-text aria-[current=page]:text-gold-text"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-auto grid gap-3 border-t-2 border-romaic-gold pt-5 text-sm">
            {bookHref && (
              <Link href={bookHref} onClick={close} className={buttonClasses({ variant: "primary", size: "lg", fullWidth: true })}>
                <CalendarDays aria-hidden="true" strokeWidth={1.75} className="size-5" />
                Check dates
              </Link>
            )}
            <div className="grid grid-cols-2 gap-3">
              <a href={facts.whatsapp} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary", size: "md", fullWidth: true })}>
                <WhatsAppGlyph className="size-5" />
                WhatsApp
                <VisuallyHidden>{whatsappHint}</VisuallyHidden>
              </a>
              <a href={facts.phone.tel} className={buttonClasses({ variant: "secondary", size: "md", fullWidth: true })}>
                <Phone aria-hidden="true" strokeWidth={1.5} className="size-5" />
                Call
              </a>
            </div>
            <a href={`mailto:${facts.email}`} className="inline-flex min-h-11 items-center break-all text-fg-2 underline-offset-4 hover:underline">
              {facts.email}
            </a>
          </div>
        </div>
      </dialog>
    </>
  );
}
