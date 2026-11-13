import { Phone } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { LogoSlot } from "@/components/ui/logo-slot";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";
import { ContactBar } from "./contact-bar";
import { romaicFacts } from "./romaic-facts";
import type { SiteFacts } from "./site-facts";

/**
 * The 404 and error screens. Each says what happened in plain words, offers
 * the way back, and keeps the booking details in reach, because a guest who
 * hits a broken link still wants a room.
 */
type HeadingLevel = 1 | 2 | 3;

function StatusBody({ title, children, actions, level = 1 }: { title: string; children: ReactNode; actions: ReactNode; level?: HeadingLevel }) {
  const Heading = `h${level}` as const;
  return (
    <div className="mx-auto grid w-full max-w-form gap-6 px-[max(1rem,env(safe-area-inset-left))] py-section-sm text-center">
      <hr className="gold-rule mx-auto w-16" />
      <Heading className="font-display text-h1 font-semibold tracking-[0.08em] text-ink uppercase">{title}</Heading>
      <div className="mx-auto grid max-w-[52ch] gap-3 text-lead text-fg-2">{children}</div>
      <div className="flex flex-wrap items-center justify-center gap-3">{actions}</div>
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

/** A whole page for when nothing else could render: the logo slot, the message, and the contact bar. */
export function StandaloneErrorPage({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="flex justify-center border-b border-hairline bg-cream px-4 py-4">
        <LogoSlot kind="wordmark" className="w-48 sm:w-60" />
      </header>
      <main id="main" className="flex flex-1 items-center bg-canvas">
        {children}
      </main>
      <ContactBar facts={romaicFacts} />
    </>
  );
}
