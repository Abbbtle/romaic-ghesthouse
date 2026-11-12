"use client";

import { Menu, X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import Link from "next/link";
import { useRef } from "react";
import { romaicFacts } from "./romaic-facts";

export type SiteNavLink = { href: string; label: string };

/**
 * The phone menu: a native modal dialog (focus moves in, Escape closes, the
 * page behind is inert), opened from a 44 px button. Cream panel, Josefin
 * capitals, and the contact details at the foot so a guest can book from the
 * menu itself.
 */
export function MobileMenu({ links }: { links: readonly SiteNavLink[] }) {
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
        className="text-ink lg:hidden"
      />
      <dialog
        ref={dialog}
        aria-label="Menu"
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
                    className="flex min-h-14 items-center font-display text-lg font-semibold tracking-[0.12em] uppercase hover:text-gold-text"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-auto grid gap-2 border-t-2 border-romaic-gold pt-5 text-sm">
            <p className="font-display font-semibold tracking-[0.16em] text-gold-text uppercase">WhatsApp or call</p>
            <a href={romaicFacts.phone.tel} className="text-lg font-bold" data-numeric>
              {romaicFacts.phone.display}
            </a>
            <a href={`mailto:${romaicFacts.email}`} className="break-all text-fg-2 underline-offset-4 hover:underline">
              {romaicFacts.email}
            </a>
          </div>
        </div>
      </dialog>
    </>
  );
}
