import { CircleAlert, Phone } from "lucide-react";
import { AmenityGroups } from "@/components/site/amenity-groups";
import { ApartmentCard, type ApartmentSummary } from "@/components/site/apartment-card";
import { BookingDock } from "@/components/site/booking-dock";
import { ContactBar } from "@/components/site/contact-bar";
import { GoldBarHeading } from "@/components/site/gold-bar-heading";
import { MotionGate } from "@/components/site/motion-gate";
import { romaicFacts } from "@/components/site/romaic-facts";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { StandInPhoto } from "@/components/site/stand-in-photo";
import { NotFoundView, ServerErrorMessage } from "@/components/site/status-views";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { errorClasses, hintClasses, inputClasses, labelClasses, selectClasses, textareaClasses } from "@/components/ui/form-controls";
import { LogoSlot } from "@/components/ui/logo-slot";
import { Notice } from "@/components/ui/notice";
import { textStyles } from "@/components/ui/typography";
import { WhatsAppButton } from "@/components/ui/whatsapp-button";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";
import { KitHeader, KitSection, Specimen, Swatch } from "./kit-parts";
import { SearchDemo } from "./search-demo";

const sections = [
  { id: "home", label: "Home" },
  { id: "brand", label: "Logo" },
  { id: "colour", label: "Colour" },
  { id: "type", label: "Type" },
  { id: "elements", label: "Elements" },
  { id: "actions", label: "Actions" },
  { id: "forms", label: "Forms" },
  { id: "booking", label: "Apartments" },
  { id: "chrome", label: "Header and footer" },
  { id: "states", label: "States" },
] as const;

const navLinks = [
  { href: "#booking", label: "Apartments" },
  { href: "#elements", label: "Facilities" },
  { href: "#chrome", label: "Location" },
  { href: "#forms", label: "Policies" },
  { href: "#states", label: "Contact" },
] as const;

const photos = {
  warm: { src: "/stand-ins/pexels-279746.jpg", alt: "A bedroom with warm bedside lamps and a wooden headboard", source: "Pexels 279746", width: 1600, height: 1014, focus: { x: 50, y: 50 } },
  bed: { src: "/stand-ins/pexels-164595.jpg", alt: "A made double bed lit by a wall lamp", source: "Pexels 164595", width: 1600, height: 1067, focus: { x: 50, y: 50 } },
  desk: { src: "/stand-ins/pexels-271618.jpg", alt: "A bright bedroom with a desk", source: "Pexels 271618", width: 1600, height: 1068, focus: { x: 50, y: 50 } },
} as const;

/** Sample apartments, from the Booking.com listing's facts (to be confirmed by the client), with stand-in photos. */
const sampleApartments: ApartmentSummary[] = [
  {
    name: "Family apartment with shower",
    href: "#booking",
    sleeps: 5,
    beds: "5 single beds",
    photo: photos.warm,
    features: [
      { label: "Kitchenette", icon: "kitchen" },
      { label: "Private bathroom", icon: "bath" },
      { label: "Wi-Fi", icon: "wifi" },
    ],
    price: null,
  },
  {
    name: "Deluxe double apartment with bath",
    href: "#booking",
    sleeps: 2,
    beds: "1 large double bed",
    photo: photos.bed,
    features: [
      { label: "Kitchenette", icon: "kitchen" },
      { label: "Bath and shower", icon: "bath" },
      { label: "Wi-Fi", icon: "wifi" },
    ],
    price: null,
  },
  {
    name: "Double or twin apartment with shower",
    href: "#booking",
    sleeps: 2,
    beds: "1 extra-large double or 2 single beds",
    photo: photos.desk,
    features: [
      { label: "Kitchenette", icon: "kitchen" },
      { label: "Private bathroom", icon: "bath" },
      { label: "Wi-Fi", icon: "wifi" },
    ],
    price: null,
  },
];

export function PublicKit() {
  const { phone, whatsapp, addressLine } = romaicFacts;
  return (
    <div className="theme-site flex min-h-svh flex-col bg-canvas">
      <MotionGate />
      <KitHeader view="public" sections={sections} />
      <main id="main" className="flex-1">
        {/* The home page's first viewport, as the direction contract sets it (Phase 2 builds the page). */}
        <section id="home" aria-labelledby="home-title" className="scroll-mt-20 bg-cream">
          <div className="mx-auto grid max-w-page gap-8 px-[max(1rem,env(safe-area-inset-left))] pt-8 pb-12 lg:grid-cols-12 lg:items-center lg:gap-12 lg:pt-12 lg:pb-16">
            <div className="order-2 grid gap-5 lg:order-1 lg:col-span-5">
              <div className="hidden lg:block">
                <LogoSlot kind="wordmark" />
              </div>
              <GoldBarHeading as="h2" size="hero" sweep>
                <span id="home-title">Spacious apartments</span>
              </GoldBarHeading>
              <p className="text-center font-display text-sm font-semibold tracking-[0.24em] text-ink uppercase lg:text-left">{addressLine}</p>
              <SearchDemo />
            </div>
            <div className="order-1 grid justify-items-center gap-5 lg:order-2 lg:col-span-7">
              <div className="lg:hidden">
                <LogoSlot kind="wordmark" />
              </div>
              <StandInPhoto photo={photos.warm} aspect="aspect-4/3" preload sizes="(min-width: 1024px) 58vw, 100vw" />
            </div>
          </div>
        </section>

        <KitSection
          id="brand"
          title="Logo"
          spec="Use only the client's logo files. Never retype the wordmark in a font, and never recolour, stretch, rotate, outline or shadow it. These slots hold its place, at its size, until the files arrive."
        >
          <div className="grid gap-8 sm:grid-cols-2">
            <Specimen label="Primary lockup on Cream: corner mark A, wordmark, corner mark B">
              <div className="grid place-items-center bg-cream p-8">
                <LogoSlot kind="lockup" />
              </div>
            </Specimen>
            <Specimen label="Wordmark on dark: always on a Cream plate with a gold frame">
              <div className="grid place-items-center bg-midnight-navy p-8">
                <div className="border-4 border-romaic-gold bg-cream p-4">
                  <LogoSlot kind="wordmark" tone="dark" />
                </div>
              </div>
            </Specimen>
            <Specimen label="Corner mark, minimum 110 px on screen">
              <div className="flex items-center gap-4 bg-cream p-8">
                <LogoSlot kind="corner-mark" />
                <LogoSlot kind="corner-mark" />
              </div>
            </Specimen>
            <Specimen label="Clear space">
              <p className="max-w-[52ch] text-base text-fg-2">
                Keep at least the height of the &ldquo;O&rdquo; in ROMAIC clear on every side of the wordmark, and half their own height around the
                corner marks. Minimum widths: wordmark 240 px, corner mark 110 px.
              </p>
            </Specimen>
          </div>
        </KitSection>

        <KitSection
          id="colour"
          title="Colour"
          tone="white"
          spec="From the brand guide. About half of every layout is Cream, Marble or white; gold about a fifth; navy anchors; ink carries text. The corner-mark colours never appear in the interface."
        >
          <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
            <Swatch name="Romaic Gold" token="romaic-gold" value="#CBA959" use="Frame bars, rules, icons on navy. Never text on light." ratio="Ink on gold 8.2:1" />
            <Swatch name="Midnight Navy" token="midnight-navy" value="#111D29" use="Contact bar, dock, primary buttons, links." ratio="White on navy 17.1:1" />
            <Swatch name="Ink Black" token="ink-black" value="#151316" use="Headlines and body text." ratio="On Cream 15.1:1" />
            <Swatch name="Cream" token="cream" value="#ECE8DD" use="Main backgrounds, the logo plate." />
            <Swatch name="Deep Gold" token="deep-gold" value="#AA823A" use="Gradient stops and large shapes only." />
            <Swatch name="Champagne" token="champagne" value="#E3CE74" use="Gold highlight; text selection." />
            <Swatch name="Marble White" token="marble" value="#EEF1F7" use="Panels behind text." />
            <Swatch name="Gold text" token="gold-text" value="#74561C" use="Gold-coloured text and icons on light grounds." ratio="On Cream 5.5:1" />
            <Swatch name="Secondary text" token="fg-3" value="#5C5649" use="Hints, captions, meta." ratio="On Cream 6.0:1" />
            <Swatch name="Control edge" token="control" value="#77705F" use="Field and checkbox borders." ratio="On Cream 4.0:1" />
            <Swatch name="Crimson" token="crimson" value="#BE042A" use="Errors; a sparing accent." ratio="On Cream 5.3:1" />
            <Swatch name="Corner marks only" token="royal-purple · coral · teal" value="#3D2175" use="Purple #3D2175, coral #E04922, teal #119AA0: inside the logo files only." />
          </div>
          <Specimen label="Gold gradient, 100°: the frame bar">
            <div className="gold-bar h-14" aria-hidden="true" />
          </Specimen>
        </KitSection>

        <KitSection
          id="type"
          title="Type"
          spec="Josefin Sans in capitals, tracked, for headlines. Arimo for everything people read. Sacramento in gold, large, at most once in a view. All three are self-hosted."
        >
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="grid content-start gap-6">
              <Specimen label="Hero · Josefin Sans 600, caps, +0.1em">
                <p className={textStyles.hero}>Spacious apartments</p>
              </Specimen>
              <Specimen label="H1 · Josefin Sans 600, caps">
                <p className={textStyles.h1}>Our apartments</p>
              </Specimen>
              <Specimen label="H2 · Josefin Sans 600, caps">
                <p className={textStyles.h2}>Where to find us</p>
              </Specimen>
              <Specimen label="H3 · Arimo 700">
                <p className={textStyles.h3}>Family apartment with shower</p>
              </Specimen>
              <Specimen label="H4 · Arimo 700">
                <p className={textStyles.h4}>In your apartment</p>
              </Specimen>
            </div>
            <div className="grid content-start gap-6">
              <Specimen label="Script · Sacramento, gold, large only">
                <p className={textStyles.script}>Welcome home</p>
              </Specimen>
              <Specimen label="Lead · Arimo 400">
                <p className={textStyles.lead}>Within walking distance of the city centre, with fast Wi-Fi that&rsquo;s always online.</p>
              </Specimen>
              <Specimen label="Body · Arimo 400, 16 px">
                <p className={textStyles.body}>
                  Each apartment has a fridge, microwave, iron and ironing board, with 3 L of drinking water, coffee, tea and cookies waiting when you
                  arrive.
                </p>
              </Specimen>
              <Specimen label="Label · Josefin Sans 600, caps, +0.14em">
                <p className={textStyles.label}>Connectivity</p>
              </Specimen>
              <Specimen label="Meta · Arimo 400, 12 px">
                <p className={textStyles.meta}>Check-in times and policies to be confirmed by the owner.</p>
              </Specimen>
              <Specimen label="Price and date numerals">
                <div className="flex flex-wrap items-baseline gap-6">
                  <p className={textStyles.price} data-placeholder="price">
                    R0,000
                  </p>
                  <p className="font-display text-date font-semibold text-ink" data-numeric>
                    12
                  </p>
                </div>
              </Specimen>
            </div>
          </div>
        </KitSection>

        <KitSection id="elements" title="Elements" tone="white" spec="The brand's graphic elements: gold frame bars, thin gold photo frames, marble panels and gold rules.">
          <div className="grid gap-8 lg:grid-cols-2">
            <Specimen label="Gold frame bar holding a headline">
              <GoldBarHeading as="h3">Spacious apartments</GoldBarHeading>
            </Specimen>
            <Specimen label="Gold rule">
              <hr className="gold-rule w-24" />
            </Specimen>
            <Specimen label="Photo in its gold frame (a labelled stand-in)">
              <StandInPhoto photo={photos.bed} aspect="aspect-3/2" sizes="(min-width: 1024px) 40vw, 100vw" />
            </Specimen>
            <Specimen label="Marble panel with a gold edge">
              <div className="marble border-4 border-romaic-gold p-6">
                <p className={textStyles.h4}>Connectivity and water</p>
                <p className="mt-1 text-base text-fg-2">Fast, always-on Wi-Fi. Backup gas water heaters and two JoJo water tanks.</p>
              </div>
            </Specimen>
          </div>
          <Specimen label="Amenities in the brand's four groups">
            <AmenityGroups />
          </Specimen>
        </KitSection>

        <KitSection id="actions" title="Actions" spec="One navy primary action per view. Secondary is outlined in ink; links are navy and underline on hover. Every target is at least 44 px.">
          <div className="grid gap-8 lg:grid-cols-2">
            <Specimen label="Buttons on light">
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className={buttonClasses({ variant: "primary", size: "lg" })}>
                  Show free apartments
                </button>
                <button type="button" className={buttonClasses({ variant: "secondary", size: "lg" })}>
                  View apartment
                </button>
                <WhatsAppButton href={whatsapp} size="lg">
                  WhatsApp us to book
                </WhatsAppButton>
                <button type="button" className={buttonClasses({ variant: "ghost" })}>
                  See all apartments
                </button>
                <button type="button" aria-disabled="true" className={buttonClasses({ variant: "primary" })}>
                  Book this apartment
                </button>
              </div>
            </Specimen>
            <Specimen label="Buttons on navy">
              <div className="on-dark flex flex-wrap items-center gap-3 bg-midnight-navy p-5">
                <button type="button" className={buttonClasses({ variant: "on-dark" })}>
                  Check dates
                </button>
                <button type="button" className={buttonClasses({ variant: "on-dark-secondary" })}>
                  <Phone aria-hidden="true" strokeWidth={1.5} className="size-5" />
                  Call {phone.display}
                </button>
              </div>
            </Specimen>
            <Specimen label="Links">
              <p className="text-base">
                Read the{" "}
                <a href="#states" className="font-bold text-link underline underline-offset-4 hover:text-link-hover">
                  house rules
                </a>{" "}
                before you arrive, or{" "}
                <a href="#chrome" className="quiet-link font-bold">
                  find us on the map
                </a>
                .
              </p>
            </Specimen>
            <Specimen label="Badges">
              <div className="flex flex-wrap gap-2">
                <Badge tone="brand">Sleeps 5</Badge>
                <Badge tone="gold">Wheelchair accessible</Badge>
                <Badge tone="neutral">Kitchenette</Badge>
              </div>
            </Specimen>
          </div>
        </KitSection>

        <KitSection id="forms" title="Forms" tone="white" spec="16 px text so phones don't zoom; labels above fields; errors say what went wrong and how to fix it, beside the field.">
          <form className="grid max-w-form gap-5" aria-label="Sample booking request">
            <div className="grid gap-1.5">
              <label htmlFor="kit-name" className={labelClasses}>
                Your name
              </label>
              <input id="kit-name" className={inputClasses("comfortable")} defaultValue="Thandi Mokoena" autoComplete="off" />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="kit-phone" className={labelClasses}>
                Mobile number
              </label>
              <p id="kit-phone-hint" className={hintClasses}>
                We&rsquo;ll WhatsApp you to confirm your stay.
              </p>
              <input id="kit-phone" type="tel" aria-invalid="true" aria-describedby="kit-phone-error" className={inputClasses("comfortable")} defaultValue="082 12" autoComplete="off" />
              <p id="kit-phone-error" className={errorClasses}>
                <CircleAlert aria-hidden="true" strokeWidth={1.75} className="mt-0.5 size-4 shrink-0" />
                Enter a 10-digit South African number, like 082 123 4567.
              </p>
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="kit-apartment" className={labelClasses}>
                Apartment
              </label>
              <select id="kit-apartment" className={selectClasses("comfortable")} defaultValue="family">
                <option value="family">Family apartment with shower</option>
                <option value="deluxe">Deluxe double apartment with bath</option>
              </select>
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="kit-notes" className={labelClasses}>
                Anything we should know? <span className="font-normal text-fg-3">(optional)</span>
              </label>
              <textarea id="kit-notes" className={textareaClasses()} defaultValue="We'll arrive after 19:00." />
            </div>
            <label htmlFor="kit-consent" className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-base">
              <input id="kit-consent" type="checkbox" className="check-box mt-0.5" defaultChecked />
              <span>I agree that Romaic Guesthouse may use these details to reply to my request, as the privacy notice explains.</span>
            </label>
            <fieldset className="grid gap-2">
              <legend className={labelClasses}>How should we reply?</legend>
              {["WhatsApp", "Email"].map((option, index) => (
                <label key={option} className="flex min-h-11 cursor-pointer items-center gap-3 text-base">
                  <input type="radio" name="kit-reply" className="radio-dot" defaultChecked={index === 0} />
                  {option}
                </label>
              ))}
            </fieldset>
            <Notice tone="warning" title="Sample form">
              This form shows the styles only. It doesn&rsquo;t send anything.
            </Notice>
          </form>
        </KitSection>

        <KitSection
          id="booking"
          title="Apartments and booking"
          spec="The classic page's working parts: the dates-and-guests search, then apartments that share one anatomy so guests can compare them. Sample apartments use facts from the Booking.com listing (to confirm) and stand-in photos."
        >
          <div className="grid gap-10 lg:grid-cols-[minmax(0,26rem)_1fr]">
            <Specimen label="Dates and guests">
              <SearchDemo />
            </Specimen>
            <Specimen label="Notices">
              <div className="grid gap-3">
                <Notice tone="success" title="Request sent">
                  We&rsquo;ll WhatsApp you within a few hours to confirm.
                </Notice>
                <Notice tone="info">Prices and dates shown are samples.</Notice>
                <Notice tone="danger" title="That apartment was just booked">
                  Choose another apartment or other dates.
                </Notice>
              </div>
            </Specimen>
          </div>
          <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {sampleApartments.map((apartment) => (
              <ApartmentCard key={apartment.name} apartment={apartment} />
            ))}
          </div>
        </KitSection>

        <section id="chrome" aria-labelledby="chrome-title" className="scroll-mt-20 border-t border-hairline bg-white">
          <div className="mx-auto grid max-w-page gap-2 px-[max(1rem,env(safe-area-inset-left))] pt-14 pb-6">
            <h2 id="chrome-title" className="font-display text-h2 font-semibold tracking-[0.08em] text-ink uppercase">
              Header and footer
            </h2>
            <p className="max-w-[68ch] text-base text-fg-2">
              The header with the main pages and the booking action; the menu on phones (open it at narrow widths); the phone booking dock; and the
              footer ending in the navy contact bar.
            </p>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-8 pb-14">
            <SiteHeader links={navLinks} bookHref="#booking" facts={romaicFacts} />
            <div className="mx-auto w-full max-w-sm px-4">
              <p className="mb-2 text-xs font-bold tracking-[0.08em] text-fg-3 uppercase">Phone booking dock</p>
              <BookingDock
                inline
                secondary={{ label: "See apartments", href: "#booking" }}
                primary={{ label: "WhatsApp", href: whatsapp, external: true, icon: <WhatsAppGlyph tone="mono" className="size-4" /> }}
              />
            </div>
            <SiteFooter links={navLinks} facts={romaicFacts} />
          </div>
        </section>

        <KitSection id="states" title="States" spec="The 404 and error screens. Both offer a way back and keep the booking details in reach.">
          <div className="grid gap-8 lg:grid-cols-2">
            <Specimen label="Page not found">
              <div className="border border-hairline bg-canvas">
                <NotFoundView headingLevel={3} />
              </div>
            </Specimen>
            <Specimen label="Something went wrong">
              <div className="border border-hairline bg-canvas">
                <ServerErrorMessage headingLevel={3} />
              </div>
            </Specimen>
          </div>
        </KitSection>
      </main>
      <ContactBar facts={romaicFacts} />
    </div>
  );
}
