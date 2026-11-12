import { BedDouble, Car, MapPin, Phone, Wifi } from "lucide-react";
import type { Metadata } from "next";
import { DockReveal } from "@/components/site/dock-reveal";
import { GoldBarHeading } from "@/components/site/gold-bar-heading";
import { romaicFacts } from "@/components/site/romaic-facts";
import { StandInPhoto } from "@/components/site/stand-in-photo";
import { buttonClasses } from "@/components/ui/button";
import { textStyles } from "@/components/ui/typography";
import { WhatsAppButton } from "@/components/ui/whatsapp-button";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";

export const metadata: Metadata = {
  title: { absolute: "Romaic Guesthouse, Welkom" },
  description:
    "Spacious apartments at 286 Stateway, Bedelia, Welkom, within walking distance of the CBD. WhatsApp or call +27 76 957 9928 to book.",
};

/**
 * The holding page, until the full site arrives in Phase 2. Every fact on it
 * comes from the client's own brand guide and posters (2026-11-12): the
 * headline, the address, what's in each apartment, and how to book. It ends,
 * as the brand's voice asks, with how to book. The one photo is a labelled
 * stand-in until the client's own arrive.
 */
const posterRows = [
  {
    icon: BedDouble,
    title: "In your apartment",
    lines: ["Fridge, microwave, iron and ironing board", "3 L of drinking water, coffee, tea and cookies"],
  },
  {
    icon: Wifi,
    title: "Connectivity and water",
    lines: ["Fast, always-on Wi-Fi", "Backup gas water heaters and two JoJo water tanks"],
  },
  {
    icon: Car,
    title: "Parking and security",
    lines: ["Spacious enclosed parking, electric fencing and security cameras"],
  },
] as const;

const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("286 Stateway, Bedelia, Welkom, South Africa")}`;

/** Labelled stand-in until the client's own photos arrive (brief rule 3); never presented as Romaic. Source: public/stand-ins/SOURCES.md. */
const heroPhoto = { src: "/stand-ins/pexels-279746.jpg", alt: "A bedroom with warm bedside lamps and a wooden headboard", source: "Pexels 279746" } as const;

/** The hero's booking buttons; the phone dock appears once they scroll out of view. */
const heroActionsId = "book-now";

export default function HomePage() {
  const { phone, whatsapp, email, addressLine } = romaicFacts;
  return (
    <>
      <main id="main" className="flex-1">
        <section className="bg-cream">
          <div className="mx-auto grid max-w-page grid-cols-[minmax(0,1fr)] gap-8 px-[max(1rem,env(safe-area-inset-left))] pt-6 pb-section-sm sm:gap-10 lg:grid-cols-12 lg:items-start lg:gap-14 lg:pt-14">
            {/* The warm, gold-framed photo leads (brand guide p10): an inset on phones, the right 7/12 on desktop. */}
            <div className="lg:order-last lg:col-span-7">
              <StandInPhoto photo={heroPhoto} aspect="aspect-4/3" preload sizes="(min-width: 1024px) 58vw, calc(100vw - 2rem)" />
            </div>
            <div className="grid gap-6 text-center lg:col-span-5 lg:text-left">
              <GoldBarHeading as="h1" size="hero" sweep className="lg:text-left">
                Spacious apartments in Welkom
              </GoldBarHeading>
              <p className="font-display text-sm font-semibold tracking-[0.24em] text-ink uppercase sm:text-base">{addressLine}</p>
              <p className="mx-auto max-w-[52ch] text-lead text-fg-2 lg:mx-0">
                Within walking distance of the city centre. Fast Wi-Fi that&rsquo;s always online, self-catering essentials, and backup water and
                hot water, inside a secure, enclosed property with parking.
              </p>
              <p className={`${textStyles.script} -my-1`} lang="en">
                Welcome home
              </p>
              <hr className="gold-rule" />
              <div id={heroActionsId} className="grid gap-4">
                <p className="text-base text-fg">
                  <strong>Our new website is on its way.</strong> Until it&rsquo;s ready, WhatsApp, call or email us to book your stay.
                </p>
                <div className="flex flex-wrap justify-center gap-3 lg:justify-start">
                  <WhatsAppButton href={whatsapp} size="lg" className="w-full sm:w-auto">
                    WhatsApp us to book
                  </WhatsAppButton>
                  <a href={phone.tel} className={buttonClasses({ variant: "secondary", size: "lg" }, "w-full sm:w-auto")}>
                    <Phone aria-hidden="true" strokeWidth={1.5} className="size-5" />
                    <span data-numeric>Call {phone.display}</span>
                  </a>
                </div>
                <p className="text-sm text-fg-2">
                  Or email{" "}
                  <a href={`mailto:${email}`} className="font-bold break-all text-link underline underline-offset-4 hover:text-link-hover">
                    {email}
                  </a>
                </p>
              </div>
              <hr className="gold-rule" />
            </div>
          </div>

          <div className="mx-auto max-w-page px-[max(1rem,env(safe-area-inset-left))] pb-section-sm">
            <div className="marble border-4 border-romaic-gold p-6 shadow-2 sm:p-8">
              <h2 className="sr-only">What&rsquo;s included</h2>
              <ul className="grid divide-y divide-romaic-gold/60 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
                {posterRows.map((row) => (
                  <li key={row.title} className="grid grid-cols-[3rem_1fr] items-start gap-5 py-5 first:pt-0 last:pb-0 lg:px-6 lg:py-0 lg:first:pl-0 lg:last:pr-0">
                    <row.icon aria-hidden="true" strokeWidth={1.25} className="size-11 text-gold-text" />
                    <div className="grid gap-1.5 border-l border-romaic-gold pl-5">
                      <h3 className="font-display text-h4 font-semibold tracking-[0.14em] text-ink uppercase">{row.title}</h3>
                      {row.lines.map((line) => (
                        <p key={line} className="text-base text-fg-2">
                          {line}
                        </p>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <div className="bg-canvas">
          <div className="mx-auto max-w-page px-[max(1rem,env(safe-area-inset-left))]">
            <hr className="gold-rule" />
          </div>
        </div>

        <section aria-labelledby="where" className="bg-canvas">
          <div className="mx-auto grid max-w-page gap-6 px-[max(1rem,env(safe-area-inset-left))] py-section-sm sm:grid-cols-[auto_1fr] sm:items-center sm:gap-10">
            <MapPin aria-hidden="true" strokeWidth={1.25} className="size-12 text-gold-text" />
            <div className="grid gap-2">
              <h2 id="where" className={textStyles.h2}>
                Where to find us
              </h2>
              <p className="text-lead text-fg-2">{addressLine}. A short walk from the city centre, with enclosed parking on the property.</p>
              <p>
                <a href={mapsLink} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 font-bold text-link underline underline-offset-4 hover:text-link-hover">
                  Open in Google Maps
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </p>
            </div>
          </div>
        </section>
      </main>
      <DockReveal
        afterId={heroActionsId}
        secondary={{ label: "Call", href: phone.tel, icon: <Phone aria-hidden="true" strokeWidth={1.75} className="size-4" /> }}
        primary={{ label: "WhatsApp", href: whatsapp, external: true, icon: <WhatsAppGlyph tone="mono" className="size-4" /> }}
      />
    </>
  );
}
