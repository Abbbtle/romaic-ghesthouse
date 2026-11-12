import { Mail, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import { PageBand, PageHeading } from "@/components/site/page-heading";
import { siteFactsOf } from "@/components/site/site-facts";
import { dockAfterId } from "@/components/site/site-dock";
import { buttonClasses } from "@/components/ui/button";
import { textStyles } from "@/components/ui/typography";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { WhatsAppButton } from "@/components/ui/whatsapp-button";
import { getSiteContent } from "@/server/site-content";
import { pageMetadata } from "../page-metadata";

/** Read per request with the content as it is now, like every public page (see ../layout.tsx), so it may wait for it. */
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("contact");
}

/**
 * How to reach the guesthouse: WhatsApp and call first (one tap each on a
 * phone), then email, then the address with a map link. No form: a guest
 * who wants to book uses the Book page; anyone else is one tap from a
 * conversation.
 */
export default async function ContactPage() {
  const content = await getSiteContent();
  const { contactPage } = content;
  const facts = siteFactsOf(content);
  return (
    <main id="main" className="flex-1">
      <PageBand tone="cream">
        <PageHeading title={contactPage.heading} intro={contactPage.intro}>
          <div id={dockAfterId} className="flex w-full flex-wrap gap-3">
            <WhatsAppButton href={facts.whatsapp} size="lg" className="w-full sm:w-auto">
              WhatsApp {facts.phone.display}
            </WhatsAppButton>
            <a href={facts.phone.tel} className={buttonClasses({ variant: "secondary", size: "lg" }, "w-full sm:w-auto")}>
              <Phone aria-hidden="true" strokeWidth={1.5} className="size-5" />
              <span data-numeric>Call {facts.phone.display}</span>
            </a>
          </div>
          {contactPage.responseNote && <p className={textStyles.secondary}>{contactPage.responseNote}</p>}
        </PageHeading>
      </PageBand>
      <PageBand>
        <dl className="grid gap-8 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <dt className="flex items-center gap-2 font-display text-base font-semibold tracking-[0.14em] text-ink uppercase">
              <Mail aria-hidden="true" strokeWidth={1.5} className="size-5 text-gold-text" />
              Email
            </dt>
            <dd>
              <a href={`mailto:${facts.email}`} className="inline-flex min-h-11 items-center font-bold break-all text-link underline underline-offset-4 hover:text-link-hover">
                {facts.email}
              </a>
            </dd>
          </div>
          <div className="grid content-start gap-2">
            <dt className="flex items-center gap-2 font-display text-base font-semibold tracking-[0.14em] text-ink uppercase">
              <MapPin aria-hidden="true" strokeWidth={1.5} className="size-5 text-gold-text" />
              Address
            </dt>
            <dd className="grid gap-1">
              <p className="text-base text-ink">{facts.addressLine}</p>
              <a href={facts.mapLink} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-bold text-link underline underline-offset-4 hover:text-link-hover">
                Open in Google Maps
                <VisuallyHidden>(opens in a new tab)</VisuallyHidden>
              </a>
            </dd>
          </div>
        </dl>
      </PageBand>
    </main>
  );
}
