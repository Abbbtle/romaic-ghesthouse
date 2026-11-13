import { CircleAlert, Phone } from "lucide-react";
import { AmenityGroups } from "@/components/site/amenity-groups";
import { ApartmentCard, type ApartmentSummary } from "@/components/site/apartment-card";
import { BookingDock } from "@/components/site/booking-dock";
import { MotionGate } from "@/components/site/motion-gate";
import { romaicFacts } from "@/components/site/romaic-facts";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { siteText } from "@/components/site/site-type";
import { StandInPhoto } from "@/components/site/stand-in-photo";
import { NotFoundView, ServerErrorMessage } from "@/components/site/status-views";
import { ToConfirm } from "@/components/site/to-confirm";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { errorClasses, hintClasses, inputClasses, labelClasses, selectClasses, textareaClasses } from "@/components/ui/form-controls";
import { LogoSlot } from "@/components/ui/logo-slot";
import { Notice } from "@/components/ui/notice";
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
  { id: "booking", label: "Rooms" },
  { id: "chrome", label: "Header and footer" },
  { id: "states", label: "States" },
] as const;

const navLinks = [
  { href: "#booking", label: "Rooms" },
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

/** Sample rooms, from the Booking.com listing's facts (to be confirmed by the client), with stand-in photos. */
const sampleApartments: ApartmentSummary[] = [
  {
    name: "Family room with shower",
    href: "#booking",
    summary: "Our largest: beds for up to five, a kitchenette and a private bathroom.",
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
    name: "Deluxe double room with bath",
    href: "#booking",
    summary: "A large double bed and a bathroom with both a bath and a shower.",
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
    name: "Double or twin room with shower",
    href: "#booking",
    summary: "One extra-large double or two singles, looking onto the inner courtyard.",
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
        {/* The home page's first words, set as the approved premium design sets them over the photograph. */}
        <section id="home" aria-labelledby="home-title" className="scroll-mt-20 bg-paper">
          <div className="site-wrap grid gap-12 py-12 lg:grid-cols-12 lg:items-center lg:gap-16 lg:py-16">
            <div className="grid gap-6 lg:col-span-5">
              <p className="font-display text-nav tracking-[0.04em] text-gold-text">{addressLine}</p>
              <h2 id="home-title" className={`${siteText.hero} text-ink`}>
                A secure guesthouse in Welkom
              </h2>
              <SearchDemo />
            </div>
            <div className="lg:col-span-7">
              <div className="framed">
                <StandInPhoto photo={photos.warm} aspect="aspect-4/3" preload sizes="(min-width: 1024px) 58vw, 100vw" />
              </div>
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
          spec="The brand guide's colours, as the approved premium design uses them on the public site: Paper and Cream grounds, Midnight Navy for the header, footer and evening band, Romaic Gold for hairlines and the booking button on navy, navy ink and cool greys for text. The corner-mark colours never appear in the interface."
        >
          <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
            <Swatch name="Romaic Gold" token="romaic-gold" value="#CBA959" use="Hairline frames and rules, the booking button and labels on navy. Never text on light." ratio="Navy on gold 7.6:1" />
            <Swatch name="Midnight Navy" token="midnight-navy" value="#111D29" use="Header, footer, evening band, dock; text and primary buttons on light." ratio="On Paper 16.1:1" />
            <Swatch name="Paper" token="paper" value="#FAF8F3" use="The public site's canvas." />
            <Swatch name="Ink 2" token="ink-2" value="#4A4F57" use="Secondary text on the public site." ratio="On Paper 7.8:1" />
            <Swatch name="On navy" token="on-navy · on-navy-2" value="#F3EFE6" use="Text on navy; #B8BEC7 for its secondary text." ratio="14.9:1 · 9.1:1" />
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
        </KitSection>

        <KitSection
          id="type"
          title="Type"
          spec="Josefin Sans light, large and in sentence case for display headings, tracked no wider than 0.04em; Josefin at 400-600 for titles, labels, buttons and the nav; Arimo at 17 px for everything people read. All self-hosted."
        >
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="grid content-start gap-6">
              <Specimen label="Hero · Josefin Sans 300">
                <p className={siteText.hero}>A secure guesthouse</p>
              </Specimen>
              <Specimen label="Page heading · Josefin Sans 300">
                <p className={siteText.page}>Our rooms</p>
              </Specimen>
              <Specimen label="Section heading · Josefin Sans 300">
                <p className={siteText.section}>What keeps working</p>
              </Specimen>
              <Specimen label="Title · Josefin Sans 400">
                <p className={siteText.title}>Family room with shower</p>
              </Specimen>
            </div>
            <div className="grid content-start gap-6">
              <Specimen label="Lede · Arimo 400">
                <p className={siteText.lede}>Within walking distance of the city centre, with fast Wi-Fi that&rsquo;s always online.</p>
              </Specimen>
              <Specimen label="Body · Arimo 400, 17 px">
                <p className={siteText.body}>
                  Each room has a kitchenette with a fridge and microwave, an iron and ironing board, with 3 L of drinking water, coffee, tea and
                  cookies waiting when you arrive.
                </p>
              </Specimen>
              <Specimen label="Label · Josefin Sans 600, +0.04em, gold">
                <p className={siteText.label}>Arrive</p>
              </Specimen>
              <Specimen label="Price and date numerals">
                <div className="flex flex-wrap items-baseline gap-6">
                  <p className="font-display text-[1.0625rem] text-ink" data-placeholder="price">
                    Price on request
                  </p>
                  <p className="font-display text-[2rem] leading-none font-light text-ink" data-numeric>
                    12
                  </p>
                </div>
              </Specimen>
            </div>
          </div>
        </KitSection>

        <KitSection id="elements" title="Elements" tone="white" spec="The approved design's elements: large photographs framed with a gold hairline set off their edge, gold rules over info blocks, and the quiet honesty marks.">
          <div className="grid gap-8 lg:grid-cols-2">
            <Specimen label="A large photo in its offset gold hairline (a labelled stand-in)">
              <div className="framed">
                <StandInPhoto photo={photos.bed} aspect="aspect-3/2" sizes="(min-width: 1024px) 40vw, 100vw" />
              </div>
            </Specimen>
            <Specimen label="An info block under a 2 px gold rule, and a fact still to confirm">
              <div className="grid gap-2 border-t-2 border-romaic-gold pt-5">
                <p className={siteText.titleSm}>Nearby</p>
                <p className="text-[0.9375rem] text-fg-2">
                  Nando&rsquo;s · About 320 m <ToConfirm />
                </p>
              </div>
            </Specimen>
          </div>
          <Specimen label="Amenities in the brand's four groups">
            <AmenityGroups />
          </Specimen>
        </KitSection>

        <KitSection id="actions" title="Actions" spec="One navy primary action per light view, the gold booking button on navy. Secondary is a navy outline; links are bold with a gold underline. Every target is at least 44 px.">
          <div className="grid gap-8 lg:grid-cols-2">
            <Specimen label="Buttons on light">
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className={buttonClasses({ variant: "primary", size: "lg" })}>
                  Show free rooms
                </button>
                <button type="button" className={buttonClasses({ variant: "secondary", size: "lg" })}>
                  View room
                </button>
                <WhatsAppButton href={whatsapp} size="lg">
                  WhatsApp us to book
                </WhatsAppButton>
                <button type="button" className={buttonClasses({ variant: "ghost" })}>
                  See all rooms
                </button>
                <button type="button" aria-disabled="true" className={buttonClasses({ variant: "primary" })}>
                  Book this room
                </button>
              </div>
            </Specimen>
            <Specimen label="Buttons on navy">
              <div className="on-dark flex flex-wrap items-center gap-3 bg-midnight-navy p-5">
                <button type="button" className={buttonClasses({ variant: "gold" })}>
                  Check availability
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
                <a href="#states" className={siteText.link}>
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
                Room
              </label>
              <select id="kit-apartment" className={selectClasses("comfortable")} defaultValue="family">
                <option value="family">Family room with shower</option>
                <option value="deluxe">Deluxe double room with bath</option>
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
          title="Rooms and booking"
          spec="The classic page's working parts: the dates-and-guests search, then rooms that share one anatomy so guests can compare them. Sample rooms use facts from the Booking.com listing (to confirm) and stand-in photos."
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
                <Notice tone="danger" title="That room was just booked">
                  Choose another room or other dates.
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
            <h2 id="chrome-title" className={siteText.section}>
              Header and footer
            </h2>
            <p className="max-w-[68ch] text-base text-fg-2">
              The header with the main pages and the booking action; the menu on phones (open it at narrow widths); the phone booking dock; and the
              navy footer with the contact details.
            </p>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-8 pb-14">
            <SiteHeader links={navLinks} bookHref="#booking" facts={romaicFacts} />
            <div className="mx-auto w-full max-w-sm px-4">
              <p className="mb-2 text-xs font-bold tracking-[0.08em] text-fg-3 uppercase">Phone booking dock</p>
              <BookingDock
                inline
                secondary={{ label: "See rooms", href: "#booking" }}
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
    </div>
  );
}
