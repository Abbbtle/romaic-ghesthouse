import Link from "next/link";
import { CurrentYear } from "@/components/ui/current-year";
import { VisuallyHidden, newTabHint, whatsappHint } from "@/components/ui/visually-hidden";
import type { SiteNavLink } from "./mobile-menu";
import type { SiteFacts } from "./site-facts";

const linkClasses = "inline-flex min-h-11 items-center transition-colors hover:text-romaic-gold";
const headingClasses = "mb-1 font-display text-base tracking-[0.04em] text-fg";

/**
 * The foot of every public page, one Midnight Navy band with a gold hairline
 * along its top (the approved mock-up's footer, with the old contact bar
 * folded in so two navy bands never stack): the name and the business's
 * description, where to find it, how to reach it (every number and address
 * a real link, and readable as text), every public page including the
 * privacy notice, and the copyright line. Everything comes from content;
 * the error pages pass the brand guide's details instead. The dock-height
 * padding keeps the last line clear of the phone booking dock where a page
 * shows one.
 */
export function SiteFooter({
  facts,
  links = [],
  description,
  withDock = false,
}: {
  facts: SiteFacts;
  links?: readonly SiteNavLink[];
  /** The business's short description from content, under its name. */
  description?: string;
  withDock?: boolean;
}) {
  const { phone, whatsapp, email, addressLine, mapLink, name } = facts;
  return (
    <footer
      className={`on-dark border-t border-romaic-gold/35 bg-midnight-navy text-[0.9375rem] leading-relaxed text-fg-2 ${withDock ? "pb-[calc(var(--dock-height)+env(safe-area-inset-bottom))] lg:pb-0" : ""}`}
    >
      <div className="site-wrap grid gap-x-8 gap-y-10 pt-14 pb-10 sm:grid-cols-2 sm:pt-16 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="grid content-start gap-3">
          <Link href="/" className="justify-self-start font-display text-xl leading-tight tracking-[0.04em] text-fg transition-colors hover:text-romaic-gold">
            {name}
          </Link>
          {description && <p className="max-w-[30ch]">{description}</p>}
        </div>

        <section aria-labelledby="footer-visit" className="grid content-start">
          <h2 id="footer-visit" className={headingClasses}>
            Visit
          </h2>
          <p>{addressLine}</p>
          <a href={mapLink} target="_blank" rel="noopener noreferrer" className={`${linkClasses} justify-self-start underline decoration-romaic-gold/60 underline-offset-4`}>
            Open in Google Maps
            <VisuallyHidden>{newTabHint}</VisuallyHidden>
          </a>
        </section>

        <section aria-labelledby="footer-contact" className="grid content-start">
          <h2 id="footer-contact" className={headingClasses}>
            WhatsApp or call to book
          </h2>
          <ul className="grid">
            <li>
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={`${linkClasses} whitespace-nowrap`}>
                <span data-numeric>WhatsApp {phone.display}</span>
                <VisuallyHidden>{whatsappHint}</VisuallyHidden>
              </a>
            </li>
            <li>
              <a href={phone.tel} className={`${linkClasses} whitespace-nowrap`}>
                <span data-numeric>Call {phone.display}</span>
              </a>
            </li>
            <li>
              <a href={`mailto:${email}`} className={`${linkClasses} break-all`}>
                {email}
              </a>
            </li>
          </ul>
        </section>

        {links.length > 0 && (
          <nav aria-labelledby="footer-pages">
            <h2 id="footer-pages" className={headingClasses}>
              Pages
            </h2>
            <ul className="grid grid-cols-2 gap-x-6 sm:grid-cols-1">
              {links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={linkClasses}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <p className="border-t border-white/12 pt-6 text-[0.8125rem] sm:col-span-full">
          © <CurrentYear /> {name}
        </p>
      </div>
    </footer>
  );
}
