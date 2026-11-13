import { Phone } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";
import { romaicFacts } from "./romaic-facts";
import type { SiteFacts } from "./site-facts";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { siteText } from "./site-type";

/**
 * The 404 and error screens. Each says what happened in plain words, offers
 * the way back, and keeps the booking details in reach, because a guest who
 * hits a broken link still wants a room.
 */
type HeadingLevel = 1 | 2 | 3;

function StatusBody({ title, children, actions, level = 1 }: { title: string; children: ReactNode; actions: ReactNode; level?: HeadingLevel }) {
  const Heading = `h${level}` as const;
  return (
    <div className="site-wrap grid justify-items-start gap-6 py-band-sm">
      <div className="h-px w-12 bg-romaic-gold" />
      <Heading className={siteText.page}>{title}</Heading>
      <div className="grid max-w-[34em] gap-3 text-lede text-fg-2">{children}</div>
      <div className="flex flex-wrap items-center gap-3">{actions}</div>
    </div>
  );
}

function BookingLinks({ facts }: { facts: SiteFacts }) {
  return (
    <>
      <a href={facts.whatsapp} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary" })}>
        <WhatsAppGlyph className="size-5" />
        WhatsApp us
      </a>
      <a href={facts.phone.tel} className={buttonClasses({ variant: "ghost" })}>
        <Phone aria-hidden="true" strokeWidth={1.5} className="size-5" />
        <span data-numeric>{facts.phone.display}</span>
      </a>
    </>
  );
}

/** `facts` from content where the page can read it; the brand guide's otherwise. */
export function NotFoundView({ headingLevel = 1, facts = romaicFacts }: { headingLevel?: HeadingLevel; facts?: SiteFacts }) {
  return (
    <StatusBody
      level={headingLevel}
      title="Page not found"
      actions={
        <>
          <Link href="/" className={buttonClasses({ variant: "primary" })}>
            Go to the home page
          </Link>
          <BookingLinks facts={facts} />
        </>
      }
    >
      <p>That address doesn&rsquo;t lead anywhere on our site. It may have changed, or the link may have a typo.</p>
      <p>To book a stay, WhatsApp or call us and we&rsquo;ll help.</p>
    </StatusBody>
  );
}

export function ServerErrorMessage({ retry, headingLevel = 1, facts = romaicFacts }: { retry?: () => void; headingLevel?: HeadingLevel; facts?: SiteFacts }) {
  return (
    <StatusBody
      level={headingLevel}
      title="Something went wrong"
      actions={
        <>
          {retry && (
            <button type="button" onClick={retry} className={buttonClasses({ variant: "primary" })}>
              Try again
            </button>
          )}
          <BookingLinks facts={facts} />
        </>
      }
    >
      <p>This page didn&rsquo;t load properly. Try again in a moment.</p>
      <p>If it keeps happening, WhatsApp or call us to book.</p>
    </StatusBody>
  );
}

/**
 * A whole page for when nothing else could render: the navy header with the
 * name, the message, and the navy footer with the brand guide's contact
 * details (nothing here reads the database, so it renders even when that's
 * down).
 */
export function StandaloneErrorPage({ children }: { children: ReactNode }) {
  return (
    <div className="theme-site flex min-h-svh flex-col bg-canvas">
      <SiteHeader facts={romaicFacts} />
      <main id="main" className="flex flex-1 items-center">
        {children}
      </main>
      <SiteFooter facts={romaicFacts} />
    </div>
  );
}
