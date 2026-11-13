import { Mail, MapPin, Phone } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { VisuallyHidden, whatsappHint } from "@/components/ui/visually-hidden";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";
import type { SiteFacts } from "./site-facts";

/**
 * The Midnight Navy contact bar (brand guide p8): it anchors every page at
 * the bottom edge, full width, with the booking details. Gold label, white
 * bold contact text, gold line icons. Every item is a real link, and the
 * number and address stay readable as text for anyone whose phone can't
 * follow the link.
 */
export function ContactBar({ facts, className, showAddress = true }: { facts: SiteFacts; className?: string; showAddress?: boolean }) {
  const { phone, whatsapp, email, addressLine } = facts;
  return (
    <section aria-label="Book your stay" className={cx("on-dark border-t-2 border-romaic-gold bg-midnight-navy", className)}>
      <div className="mx-auto grid max-w-page gap-x-10 gap-y-4 px-[max(1rem,env(safe-area-inset-left))] py-6 sm:py-7 lg:grid-cols-[auto_1fr] lg:items-center">
        <div className="grid gap-1">
          <p className="font-display text-sm font-semibold tracking-[0.22em] text-romaic-gold uppercase">WhatsApp or call to book</p>
          {showAddress && (
            <p className="inline-flex min-h-11 items-center gap-3 text-base text-on-dark-2">
              <MapPin aria-hidden="true" strokeWidth={1.5} className="size-5 shrink-0 text-romaic-gold" />
              <span>{addressLine}</span>
            </p>
          )}
        </div>
        <ul className="flex flex-col gap-x-8 gap-y-3 text-base font-bold sm:flex-row sm:flex-wrap sm:items-center lg:flex-nowrap lg:justify-end">
          <li>
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-3 whitespace-nowrap underline-offset-4 hover:underline">
              <WhatsAppGlyph tone="mono" className="size-5 shrink-0 text-romaic-gold" />
              <span data-numeric>WhatsApp {phone.display}</span>
              <VisuallyHidden>{whatsappHint}</VisuallyHidden>
            </a>
          </li>
          <li>
            <a href={phone.tel} className="inline-flex min-h-11 items-center gap-3 whitespace-nowrap underline-offset-4 hover:underline">
              <Phone aria-hidden="true" strokeWidth={1.5} className="size-5 shrink-0 text-romaic-gold" />
              <span data-numeric>Call {phone.display}</span>
            </a>
          </li>
          <li>
            <a href={`mailto:${email}`} className="inline-flex min-h-11 items-center gap-3 break-all underline-offset-4 hover:underline lg:break-normal lg:whitespace-nowrap">
              <Mail aria-hidden="true" strokeWidth={1.5} className="size-5 shrink-0 text-romaic-gold" />
              <span>{email}</span>
            </a>
          </li>
        </ul>
      </div>
    </section>
  );
}
