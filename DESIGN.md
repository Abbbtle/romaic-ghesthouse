---
name: Romaic Guesthouse
description: A secure guesthouse in Welkom. The public site is "a gold-town guesthouse after dark" in the client's navy and gold; the dashboard keeps its quieter Cream, gold and navy.
colors:
  romaic-gold: "#cba959"
  deep-gold: "#aa823a"
  champagne: "#e3ce74"
  gold-text: "#74561c"
  midnight-navy: "#111d29"
  navy-850: "#1a2938"
  navy-hover: "#1e2f40"
  ink-black: "#151316"
  cream: "#ece8dd"
  paper: "#faf8f3"
  canvas: "#faf8f3"
  chalk: "#f3f0e8"
  white: "#ffffff"
  marble: "#eef1f7"
  ink-2: "#4a4f57"
  ink-3: "#5a5f68"
  on-navy: "#f3efe6"
  on-navy-2: "#b8bec7"
  fg-2: "#4a453b"
  fg-3: "#5c5649"
  control: "#77705f"
  crimson: "#be042a"
  success: "#1f6b57"
typography:
  display-hero:
    fontFamily: "Josefin Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.75rem, 1.6rem + 4.2vw, 5.25rem)"
    fontWeight: 300
    lineHeight: 0.98
    letterSpacing: "-0.01em"
  display-page:
    fontFamily: "Josefin Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.375rem, 1.5rem + 3vw, 4.25rem)"
    fontWeight: 300
    lineHeight: 1.02
    letterSpacing: "-0.01em"
  display:
    fontFamily: "Josefin Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 1.4rem + 2.6vw, 3.75rem)"
    fontWeight: 300
    lineHeight: 1.04
    letterSpacing: "-0.01em"
  display-sm:
    fontFamily: "Josefin Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 1.45rem + 1vw, 2.375rem)"
    fontWeight: 300
    lineHeight: 1.1
    letterSpacing: "-0.005em"
  display-address:
    fontFamily: "Josefin Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 1.2rem + 5vw, 6rem)"
    fontWeight: 300
    lineHeight: 1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Josefin Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.2
  title-sm:
    fontFamily: "Josefin Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.25
  label:
    fontFamily: "Josefin Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    letterSpacing: "0.04em"
  nav:
    fontFamily: "Josefin Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    letterSpacing: "0.04em"
  body:
    fontFamily: "Arimo, Arial, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.65
  lede:
    fontFamily: "Arimo, Arial, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.0625rem, 1rem + 0.3vw, 1.1875rem)"
    fontWeight: 400
    lineHeight: 1.6
  admin-title:
    fontFamily: "Arimo, Arial, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 1.3rem + 0.9vw, 2.0625rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "0em"
  admin-body:
    fontFamily: "Arimo, Arial, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  site: "0px"
  xs: "2px"
  sm: "2px"
  md: "4px"
  lg: "8px"
  pill: "999px"
spacing:
  band: "clamp(4.5rem, 9vw, 8rem)"
  band-sm: "clamp(3rem, 6vw, 5.5rem)"
  gutter: "clamp(1.25rem, 5.5vw, 5rem)"
  wrap: "80rem"
  section: "clamp(3.5rem, 2.5rem + 4.5vw, 6.5rem)"
  section-sm: "clamp(2.5rem, 2rem + 2.5vw, 4rem)"
components:
  site-button-primary:
    backgroundColor: "{colors.midnight-navy}"
    textColor: "{colors.white}"
    typography: "{typography.nav}"
    rounded: "{rounded.site}"
    height: "52px"
    padding: "0 28px"
  site-button-gold:
    backgroundColor: "{colors.romaic-gold}"
    textColor: "{colors.midnight-navy}"
    rounded: "{rounded.site}"
    height: "46px"
    padding: "0 22px"
  site-button-gold-hover:
    backgroundColor: "#d9bc77"
  site-button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.midnight-navy}"
    rounded: "{rounded.site}"
    height: "52px"
  site-header:
    backgroundColor: "{colors.midnight-navy}"
    textColor: "{colors.on-navy}"
    height: "88px"
  site-footer:
    backgroundColor: "{colors.midnight-navy}"
    textColor: "{colors.on-navy-2}"
  availability-bar:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.site}"
  room-card:
    textColor: "{colors.midnight-navy}"
    rounded: "{rounded.site}"
  evening-band:
    backgroundColor: "{colors.midnight-navy}"
    textColor: "{colors.on-navy}"
  booking-dock:
    backgroundColor: "{colors.midnight-navy}"
    textColor: "{colors.on-navy}"
    height: "64px"
  button-primary:
    backgroundColor: "{colors.midnight-navy}"
    textColor: "{colors.white}"
    rounded: "{rounded.sm}"
    height: "44px"
    padding: "0 18px"
  button-primary-hover:
    backgroundColor: "{colors.navy-hover}"
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink-black}"
    rounded: "{rounded.sm}"
    height: "44px"
    padding: "0 18px"
  field:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink-black}"
    rounded: "{rounded.sm}"
    height: "48px"
    padding: "0 12px"
  admin-panel:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.md}"
  admin-nav-current:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.midnight-navy}"
    rounded: "{rounded.sm}"
    height: "44px"
---

# Design System: Romaic Guesthouse

> **Record status.** Rewritten for the public site on 2026-11-13, from the shipped build of the premium direction approved that day (branch `design/premium-public-site`). The dashboard sections are unchanged from the Phase 5 record of the same date. Tokens above are normative.
>
> **Sources:**
> - tokens and recipes: `src/app/globals.css` (the public site's differences from the dashboard live under `.theme-site`);
> - fonts: `src/app/layout.tsx`;
> - type recipes: `src/components/site/site-type.ts` (`siteText`, the public site) and `src/components/ui/typography.ts` (`textStyles`, the dashboard and the design preview);
> - components: `src/components/site/*`, `src/components/ui/*`, `src/components/admin/*`;
> - live preview: `/kit` (`src/app/kit/*`);
> - the approved mock-up: `docs/planning/proposals/premium/index.html` (local, gitignored);
> - direction contract: `.impeccable/surfaces/src-app-site-page-tsx.md`;
> - brand guide transcription: `docs/planning/brand-guide-notes.md`, citing *Romaic Guesthouse Brand Guide*, Edition 1, November 2026, by page (p4, p5…).
>
> The section headings use the DESIGN.md format's fixed English names ("Colors"), which tools parse; the prose uses South African spelling.

## Overview

**Creative North Star: "A Gold-Town Guesthouse After Dark"** (the public site)

- **Direction:** the premium direction Weberu approved on 2026-11-13, replacing the classic poster recipe of 2026-11-12 on the public site. Midnight navy and Romaic gold; large photographs framed with a gold hairline set off their edge; Josefin Sans light and large, in sentence case; Arimo for reading.
- **The rule of space:** space comes from the photographs, never from stretched sections. Bands are as tall as their content needs; photos are large and close.
- **Still the classic page underneath:** the home page answers the guest's questions in order: a full-bleed photo with the name and address, the dates-and-guests search over its foot, the house and what keeps working, every room with its price, the house times, how to get here, and an invitation to book.
- **The dashboard is not part of this direction.** It keeps its white panels on Chalk, Arimo titles and small, exact doses of gold, navy and Cream (see the dashboard sections below). Nothing under `/admin` sits inside `.theme-site`, so none of the public site's overrides reach it.

**Key Characteristics (public site):**
- Paper and Cream grounds; navy for the header, the evening band, the footer and the phone dock.
- Josefin Sans light for display headings, Josefin 400–600 for titles, labels, buttons and the nav, tracked no wider than 0.04em; Arimo at 17 px for everything people read.
- Square corners everywhere.
- Gold as hairlines and rules, as labels, as the booking button on navy, and as the offset frame around the large photos.
- One entrance on the home hero, in CSS, and none under reduced motion.
- Placeholders that quietly say they are placeholders.

## Colors

The client's palette (brand guide p5), with the approved mock-up's paper, cool greys and on-navy tones. All defined in `src/app/globals.css`.

### Primary
- **Midnight Navy** (`--color-midnight-navy`): the header, the evening band, the footer, the phone menu and dock; text (ink) and the primary button on light grounds. On Paper 16.1:1.
- **Romaic Gold** (`--color-romaic-gold`): hairlines (the header's current page, card and fact rules on navy, the footer's top edge), the 2 px rules above info blocks, the offset photo frame, the availability bar's top edge, labels and links' hover on navy, the focus ring on navy, and the gold button on navy. Navy on gold 7.6:1. Never text on light grounds (2.1:1 on Paper).

### Secondary
- **Gold Text** (`--color-gold-text`, aliased `fg-brand` on light grounds): gold that must be read on Paper, Cream or white: field labels, the "To confirm" mark, line icons, the focus ring on light grounds. 6.4:1 on Paper, 5.5:1 on Cream.
- **Navy 850** (`--color-navy-850`): the raised navy behind a photo while it loads, and "Photo to come" blocks.
- **Champagne** and **Deep Gold**: the gold button's pressed state (Champagne), text selection and inline marks; Deep Gold is a gradient stop only.
- **Gold gradient** (`--gradient-gold`): kept for the design preview's gold rule only. The public site no longer uses it.

### Tertiary
- **Crimson** (`--color-crimson`, `--color-danger-600`): errors and destructive actions only (the dates bar's invalid line, invalid fields).
- **Corner-mark accents** (`--color-royal-purple`, `--color-coral`, `--color-teal`): the logo files only. Never UI colours.
- **WhatsApp green** (`--color-whatsapp`): the WhatsApp glyph only.

### Neutral
- **Paper** (`--color-paper`, the site's `canvas`): the public site's ground.
- **Cream** (`--color-cream`): the rooms band and the closing band on the home page; the loading placeholder.
- **White**: the availability bar, fields, the room page's accessibility panel, the request summary.
- **Ink 2** (`--color-ink-2`, the site's `fg-2`) and **Ink 3** (`--color-ink-3`, the site's `fg-3`): secondary text and meta on light grounds (7.8:1 and 6.0:1 on Paper; 6.7:1 and 5.2:1 on Cream).
- **On Navy** (`--color-on-navy`) and **On Navy 2** (`--color-on-navy-2`): text and secondary text on navy (14.9:1 and 9.1:1).
- **Hairline**: navy at 14% on light grounds, gold at 30% on navy (`--color-hairline` under `.theme-site` and `.theme-site .on-dark`).
- **Dashboard neutrals** (unchanged): Chalk canvas, white panels, warm greys (`--color-neutral-*`), Ink Black text, `fg-2` `#4a453b`, `fg-3` `#5c5649`, control edge `#77705f`.

### Named Rules
**The Theme Scope Rule.** The public site's colours are role overrides under `.theme-site` (ink and text in navy, cool greys, navy hairlines, a gold focus ring, transparent navy-outline secondary buttons). Components keep using role names (`text-ink`, `text-fg-2`, `border-hairline`), so the same component reads correctly on the public site, in the dashboard and in the preview.

**The On-Navy Rule.** A navy surface on the public site carries `.on-dark`; under `.theme-site` that flips text to On Navy, secondary text to On Navy 2, `fg-brand` and link hover to Romaic Gold, hairlines to gold at 30% and the focus ring to Romaic Gold. Dark surfaces use the recipe rather than hand-set colours.

**The Gold Placement Rule.** Gold is never text on a light ground (use Gold Text). It may fill a button only on navy: the header's "Check availability", the phone menu's and the phone dock's main action.

## Typography

**Display and UI face:** Josefin Sans (`--font-display`), self-hosted by next/font as one variable file (`weight: "variable"`, 100–700), so the light 300 is always present.
**Reading face:** Arimo (`--font-sans`), variable, 400–700.
**Script:** Sacramento is still loaded (not preloaded) for the design preview; the public site no longer uses it.
**Mono:** the system mono stack, for references a person reads out (the booking reference on the confirmation page; codes in the dashboard).

### Hierarchy (public site, `siteText` in `src/components/site/site-type.ts`)
- **Hero** (`--text-display-hero`, 300, −0.01em, max 11.5ch): the home page's one headline, on the photograph.
- **Page** (`--text-display-page`, 300): an inner page's h1.
- **Section** (`--text-display`, 300, max 12ch where it sits beside a photo): the home page's h2s, and a room page's h1 (room names are long).
- **Sub** (`--text-display-sm`, 300): headings inside a page's body ("In the room", "Free nights", "Rooms for your stay").
- **Address** (`--text-display-address`, 300, −0.02em): the address as the heading of "Getting here", and on the Location page at Section size.
- **Title large** (2rem, 300): the lead room's name. **Title** (`--text-title`, 400): room names, group names, panel titles. **Title small** (`--text-title-sm`, 400): room names in the row of four, info-block titles, form legends, nearby places, rule names.
- **Nav** (`--text-nav`, 400, +0.04em): the header links, the address line in the hero, the "All rooms" link.
- **Label** (`--text-label`, 600, +0.04em, Gold Text; Romaic Gold on navy): field labels in the dates search, fact labels on a room's page and the confirmation page.
- **Buttons** (Josefin 600, 15 px, +0.04em): every button on the public site, through the `site:` variant in `src/components/ui/button.tsx`.
- **Lede** (`--text-lede`, Ink 2, max 34em); **Body** (Arimo 17 px, 1.65; 16 px under 560 px, through `--text-base` under `.theme-site`); **Secondary** (15 px, Ink 2).
- **Numerals:** the dates search's day numerals and guest count in Josefin light (2rem and 1.75rem); prices in Josefin 400 ("From R850 a night", "Price on request"); tabular figures for `time`, tables and `[data-numeric]`.

### Hierarchy (dashboard, `textStyles`, unchanged)
Arimo 700 page titles (`--text-h2`, `--text-h3` in the phone header bar), Arimo 700 card and dialog titles (`textStyles.h3`, `h4`), Arimo 400 body at 16 px.

### Named Rules
**The Sentence Case Rule.** Every heading, label, button and nav link on the public site is in sentence case. No upper-case tracking.

**The 0.04em Rule.** Josefin is tracked no wider than 0.04em; display sizes are set slightly tight (−0.01em to −0.02em).

**The Light Display Rule.** Display headings are Josefin 300. Titles and labels step up to 400 and 600; bold Arimo appears only in links and inline emphasis.

## Layout

- **Width and gutters:** `site-wrap` (`src/app/globals.css`) is `min(100% − 2 × gutter, 80rem)`, centred, with the gutter `clamp(1.25rem, 5.5vw, 5rem)` (never narrower than a phone's safe-area inset).
- **Rhythm:** `--spacing-band` (72–128 px) between the home page's sections, `--spacing-band-sm` (48–88 px) for inner-page bodies and the closing band. An inner page's heading band is `pt clamp(3rem, 7vw, 5.5rem)`, `pb clamp(2.5rem, 5vw, 4rem)` (`PageBand spacing="head"` in `src/components/site/page-heading.tsx`).
- **Home page** (`src/app/(site)/page.tsx`):
  1. **Hero:** full bleed, `min(92svh, 860px)` tall (at least 600 px) from 900 px; on phones it's as tall as its words, with 176 px above them (room for the 72 px header) and 120 px below. The header sits transparent over it. Inside: the address line in gold with a 48 px gold rule before it, the headline (max 11.5ch) and the lede (max 30em, `#d9dde3`), all at the bottom left.
  2. **Availability bar:** the dates search (`layout="bar"`) pulled 64 px up over the hero's foot, the full content width; "Or WhatsApp us or call …" under it.
  3. **The house:** 6fr/5fr from 900 px: the highlights heading, lede and facts list (two columns from 560 px, each fact over a hairline), "See all our facilities", and the framed photo at 4:5.
  4. **Rooms** (Cream): the heading and lede side by side, then the first room as the lead card (7fr) beside the next two stacked (5fr, in two equal rows), then the rest in a row of four from 1080 px (two from 560 px) under a hairline, then "Compare the rooms" and the navy "Check availability". It holds any number of rooms: with one room there's no stack, with three there's no row.
  5. **Evening band** (navy): 5fr/7fr: heading, lede, the check-in and check-out times as ruled rows, "Read the house rules"; and the collage, a 4:3 photo with a square one overlapping its lower left edge in a 10 px navy border, and a gold corner hairline at its top right.
  6. **Getting here:** the address as the h2, a link to the map; then four info blocks under 2 px gold rules (where to find us, nearby, getting here, contact), four across from 1080 px.
  7. **Closing** (Cream, `band-sm`): the welcome line large beside the Book page's introduction, the navy "Check availability" and the WhatsApp or call line.
- **Inner pages:** `PageHeading`: the h1 on the left and the introduction with the page's own actions on the right, on one baseline from 900 px, stacked below. Then the body on the same Paper ground.
- **Rooms:** cards two to a row from 640 px; with an odd number of rooms the first is a full-width feature card (photo 7fr, words 5fr from 900 px), so none is left alone.
- **Room page:** the framed lead photo at 7/12 on the right (more photos in a row beneath), the back link, name, summary, price, "Check dates for this room" and the facts on the left; then a hairline, the body at 7/12 and the dates panel sticky at 5/12 (first on phones).
- **Book flow:** without a search, the heading and introduction beside the search panel; with one, the summary under the heading, results as ruled rows (16rem photo beside the details from 640 px); the request form at 7/12 beside the stay summary at 5/12 (first on phones).
- **Chrome heights** (`:root`): `--site-header-height` 4.5rem (5.5rem from 900 px) and `--dock-height` 4rem. The dock's navy spacer at the foot of the page keeps it off the footer's last line.
- **Dashboard** (unchanged): a 248 px white sidebar beside a Chalk canvas from 1024 px; below that a fixed bottom tab bar, a sticky 56 px page-header bar, and 16 px padding. Fields carry `scroll-mt-24 scroll-mb-44`, and every link, button, summary and `[tabindex]` inside `[data-admin-shell]` gets matching scroll margins.
- **Touch targets:** 44 px on phones everywhere; footer links tighten to 36 px from 1024 px.

## Elevation & Depth

The public site is flat: tone (Paper, Cream, navy) and hairlines carry the structure. Two shadows remain, both soft:
- **The availability bar** (`0 24px 60px -24px rgb(17 29 41 / 0.35)`): the approved mock-up's lift as the bar overlaps the photograph. The negative spread keeps it a soft pool under the bar, not a halo.
- **The dates panel** on other pages (`0 18px 40px -24px rgb(17 29 41 / 0.25)`), over its hairline edges.
- **The phone dock** keeps `shadow-sheet`.

The dashboard keeps its vocabulary: `shadow-1` (current tab segment), `shadow-2` (tab bar, skip link), `shadow-3` (sheets, dialogs, toasts), `shadow-sheet`, all under 8% opacity and always over an edge.

### Named Rules
**The Edge First Rule.** Every shadow sits on something that already has an edge or a gold top. In the dashboard, shadows stay under 8% opacity on light grounds; the availability bar is the public site's one deliberate exception.

## Shapes

- **Corners:** square on the public site: `.theme-site` sets `--radius-xs`, `--radius-sm`, `--radius-md` and `--radius-field` to 0, so shared buttons, fields, notices and tags come out square there. The dashboard keeps 2 px (buttons, fields), 4 px (panels, cards, toasts) and 8 px (dialogs, sheet tops).
- **Lines:**
  - hairlines (1 px, navy 14% or gold 30% on navy) under facts, room meta, list rows and between sections;
  - 2 px Romaic Gold rules above info blocks, amenity groups, policy times, contact blocks, the accessibility panel and the request summary;
  - the availability bar's and the phone menu's 2 px gold top edge;
  - the footer's top edge and the dock's, gold at 35% and 60%;
  - the offset frame: a 1 px Romaic Gold rectangle set `clamp(0.75rem, 1.6vw, 1.375rem)` down and right of the photo (`.framed`).
- **Markers:** small 4–6 px gold squares before room features and card facts.
- **Icons:** lucide line icons, stroke 1.5, in Gold Text on light grounds (amenities, the accessibility heading, the dates search's calendar); the header, menu and dock use few.

## Components

### Buttons (public site)
`src/components/ui/button.tsx`. On the public site (`site:` variant) every button is Josefin Sans 600 at 15 px, tracked 0.04em, square, with 28 px (lg) or 22 px (md) side padding.
- **Primary:** navy with white text, for the main action on a light ground (the dates search's "Check availability", "Send request", the rooms' "Check availability").
- **Gold** (`variant="gold"`): Romaic Gold with navy text, hover `#d9bc77`, pressed Champagne. Only on navy: the header's "Check availability", the phone menu's.
- **Secondary:** a navy outline on the page's own ground (`--color-btn-secondary-*` under `.theme-site`): "Call", the map apps, "WhatsApp us" on error pages.
- **WhatsApp:** navy with the WhatsApp glyph, as in the dashboard.
- **On dark secondary:** a light outline on navy (the menu's WhatsApp and Call).
- **States:** colour transitions over 150 ms and a 0.98 press scale (motion-safe only); busy shows the spinner and working label in the same cell; disabled is `aria-disabled` at 50%.

### Links
`siteText.link`: bold Arimo with a 2 px Romaic Gold underline 6 px below; on hover the underline takes the text's colour. Quiet links (footer, the header nav) have no underline at rest and turn gold on hover.

### Fields
`src/components/ui/form-controls.ts` and `fields.tsx`, shared with the dashboard. On the public site they are square, 48 px, white, with the 1 px control edge; labels are bold Arimo; the focus ring is Gold Text. The request form's fieldset legends are Josefin titles (`src/components/site/request-form.tsx`).

### Header
`src/components/site/site-header.tsx`, `header-nav.tsx`, `.site-header` in `globals.css`. One row: 72 px, 88 px from 900 px. Navy (`on-dark`) on every page; on the home page it sits absolutely over the photograph with a transparent ground (`.theme-site:has(> main > [data-hero]) > .site-header`; without `:has()` it simply stays navy above the photo). On the left, the business's name from content in Josefin 400 (17 px, 20 px from 900 px), linked home. On the right, from 1200 px, the six page links (Rooms, Facilities, Location, Gallery, House rules, Contact) in the nav style, a gold hairline under the hovered link and under the current page, which is also Romaic Gold and `aria-current`. Then, from 560 px, the gold "Check availability" button (46 px). Below 1200 px the "Menu" button (text and icon, 44 px, set off by a gold hairline at 50%) opens the phone menu.

### Phone menu
`src/components/site/mobile-menu.tsx`. A native modal `<dialog>` at the right edge, `min(22rem, 100vw)` wide: navy with a 2 px gold top edge. Focus moves to the close button; Escape, a link, the close button or a tap beside it closes it; the Menu button's `aria-expanded` follows, and `aria-controls` names the dialog. The pages are Josefin light at 20 px in 56 px rows over gold hairlines, the current one gold. At the foot: the gold "Check availability", WhatsApp and Call as light outlines, and the email address.

### Footer
`src/components/site/site-footer.tsx`. One navy band with a gold hairline at 35% along its top. Four columns from 1024 px (two from 640 px, one below): the name and the business's description from content; "Visit" (the address and "Open in Google Maps"); "WhatsApp or call to book" (WhatsApp, Call and the email, each a real link that also reads as text); "Pages" (every public page, Book and the privacy notice, in two columns). Then a hairline and the copyright line. It replaces the old separate navy contact bar, so two navy bands never stack. The error pages pass the brand guide's details (`romaicFacts`) and no description.

### Phone booking dock
`src/components/site/booking-dock.tsx`, `dock-reveal.tsx`, `site-dock.tsx`. Two equal actions on navy under a gold hairline at 60%, hidden from 1024 px: the secondary as a light outline, the main action in gold, both in the buttons' Josefin. "Check dates" and WhatsApp; Call and WhatsApp on the Book pages; none on the confirmation page. It appears once the page's own booking action (the element with id `dock-after`) has scrolled away, read from its position on scroll; while hidden it's below the edge, `invisible`, `inert` and `aria-hidden`. It slides up over 200 ms, and simply appears under reduced motion.

### Dates search and availability bar
`src/components/site/dates-search.tsx`. A GET form to the Book page (`arrive`, `leave`, `guests`, and `apartment` from a room's page), so it works without scripts.
- **`layout="bar"`** (home): white, a 2 px gold top edge, the bar shadow; arrive, leave, guests and the navy button in one row from 900 px (`1.1fr 1.1fr 0.9fr auto`), and below that arrive and leave side by side, guests, then the button, each part divided by hairlines.
- **`layout="panel"`** (a room's page, the Book page): the same parts stacked, with hairline sides.
- **Date cells:** a Gold Text label ("Arrive", "Leave"), then the day as a Josefin light numeral with "Sat · Dec" beside it, or a calendar icon and "Add date". The device's own date field covers the cell; while it has focus it shows its own date in place of the numeral, and the cell takes a warm tint and an inset Gold Text ring. An invalid cell has a 2 px crimson line along its foot; the message sits in a row of its own under the parts.
- **Guests:** a 44 px minus and plus (named by tooltips, limits as `aria-disabled`) around a Josefin light count.

### Room cards
`src/components/site/apartment-card.tsx`, data from `apartment-summary.ts`. A photo at 4:3, the name (the link, stretched over the whole card), and a line of detail over a hairline with the price: "From R850 a night" from the rates (`nightlyFromPrices`), or "Price on request" (marked `data-placeholder="price"`). Layouts: **lead** (the name in Title large, the room's summary), **stacked** (photo and words side by side from 560 px, filling half the lead's height), **compact** ("Sleeps up to N"), **standard** (the Rooms page: sleeps and beds, the three short facts with gold squares, the price and "View room"), **feature** (the standard card with the summary, side by side from 900 px). An unconfirmed room carries "To confirm". The photo zooms to 1.035 over 700 ms on hover (motion-safe only); focus rings the whole card in gold through `:has(a:focus-visible)`.

### Photos, the offset frame and stand-ins
- `ContentPhoto` (`src/components/site/content-photo.tsx`) shows a photo from content; on the public site photos are unframed, on a navy ground while they load (`.theme-site .photo-frame`).
- `FramedPhoto` wraps one in `.framed`, the offset gold hairline: the house photo and a room's lead photo (the design preview uses it too).
- **Stand-ins** (`src/components/site/stand-in-photo.tsx`): any photo under `/stand-ins/` is a stand-in, worked out from its address, so only replacing the photo removes the mark. Each says so on its own face with `StandInCaption`: a soft navy shadow along the bottom edge and small light Arimo, "Stand-in" on a thumbnail, "Stand-in photo" from 8rem wide, "· Pexels 279746" from 15rem (always in its title). The hero places the same caption at its bottom right, above the availability bar, over its own gradient. Every stand-in is marked `data-placeholder="photo"`. Sources: `public/stand-ins/SOURCES.md`.

### "To confirm" and unknown values
`src/components/site/to-confirm.tsx`. A fact from the Booking.com listing that the owner hasn't confirmed carries `ToConfirm`: "To confirm" in Josefin 12 px, tracked 0.04em, in `fg-brand` (Gold Text on light, Romaic Gold on navy), with a dashed underline, like a proof annotation, marked `data-placeholder="unconfirmed"`. One wording only. Where every fact in a group is unconfirmed (house rules, the check-in and check-out pair on the House rules page, a facilities group, the nearby places), one mark sits beside the group's heading; elsewhere each unconfirmed fact has its own (each room card; each time row in the home page's evening band; each nearby place on the home page). A value nobody has given (the booking terms) shows `NotYetKnown`, in italic Ink 3, marked `data-placeholder="unknown"`.

### Facilities, policies, contact and location blocks
Amenity groups (`src/components/site/amenity-groups.tsx`) and the House rules times, the Contact page's email and address, and the Location page's sections all sit under 2 px gold rules with Josefin titles; lists inside them are ruled rows. The Location page sets the address at Section size with the map apps as secondary buttons.

### Availability calendar
`src/components/site/availability-calendar.tsx`, on each room's page (`#free-nights`). Two months as tables, weeks from Monday, the month as a Josefin title. Free nights are plain bold numerals; booked nights are struck through on a `neutral-100` chip; each night's state is also in words for screen readers. A room with no units set up shows a sentence and a WhatsApp link instead.

### Book results and request
Results are ruled rows; free shows the success tag "Free for your dates", unknown is a sentence, booked dims the row and points to the free nights. Only the first room that can be requested has the navy "Request this room"; the rest are secondary. The request form keeps its fieldsets, consent with the privacy notice linked, the full-width navy "Send request" and "Sending this doesn't book or charge anything."

### Status views
`src/components/site/status-views.tsx`. The 404 and error screens: a short gold hairline, the heading at Page size, the plain-words explanation, then the home or retry button and WhatsApp and the phone. `StandaloneErrorPage` (root `error.tsx` and `global-error.tsx`) wraps them in `.theme-site` with the navy header (the name only) and the navy footer, with the brand guide's details, since it renders without the database.

### Link preview image
`src/app/opengraph-image.tsx`: the picture a shared link shows (1200 × 630, made at build time from the brand guide's facts). A navy field holds:
- the name in Josefin 400 at the top left, as the header sets it;
- a short gold rule over the headline, "A secure guesthouse / in Welkom", in Josefin light, set as two lines because the renderer can't balance;
- under a gold hairline at 35%, the address in Arimo (On Navy 2) on the left, and on the right "WhatsApp or call to book" as a gold label over the phone number.

It shows no photo until the guesthouse's own arrive, and no logo until its files do. The renderer can't read WOFF2, so it uses Latin TTFs of Josefin Sans (300, 400 and 600) and Arimo (400) from `assets/fonts/`, which also holds their licences.

### Navigation (dashboard)
- **Dashboard sidebar** (`src/components/admin/admin-nav.tsx`, `src/components/admin/admin-shell.tsx`): the corner-mark logo slot over "Dashboard"; 44 px rows in Arimo 500, `fg-2`, with a Chalk hover; the current page has a Cream tint, a semibold navy label and a Gold Text icon, with no side stripe; footer rows: View website, Get help from Weberu, Account, Sign out.
- **Phone tab bar** (`src/components/admin/admin-nav.tsx`): white, a 24 px icon over each label; the current tab has a navy label and a 3 px Romaic Gold bar along its top edge. "More" opens a bottom sheet.
- **Tabs** (`src/components/admin/tabs.tsx`): a segmented bar on `neutral-100`; the current segment is white with shadow-1.

### Buttons and fields (dashboard)
Bold Arimo buttons with 2 px corners and a 1.5 px border: lg 52 px, md 44 px, sm 36 px with a 44 px hit area. Primary navy, secondary white with an ink border, ghost underlined at rest, danger Crimson. Fields are white with a 1 px control edge and 2 px corners, 44 px tall (compact); read-only and disabled sit on Chalk; the invalid border stays Crimson. The checkbox is navy-filled with a white tick, the radio a filled ring, the select has a `fg-3` chevron. The code input is one 56 px mono field for two-step sign-in.

### Cards, panels and dialogs
- **Dashboard panel / card** (`src/components/admin/panel.tsx`, `src/components/ui/card.tsx`): white (or Chalk), with a hairline border and 4 px corners. Panel headings are bold Arimo.
- **Confirm dialog** (`src/components/admin/confirm-dialog.tsx`): a native dialog on the navy scrim (`--color-backdrop`), 400 px wide, with 8 px corners and shadow-3. It has an h4 title, `fg-2` body and right-aligned actions. It is used before replacing recovery codes (`src/components/admin/account/recovery-codes.tsx`) and before discarding unsaved edits (`src/components/admin/save-bar.tsx`, "Discard changes").
- **Dashboard error view** (`src/components/admin/dashboard-error.tsx`, used by `src/app/admin/error.tsx` and `src/app/admin/(dashboard)/error.tsx`): a white `role="alert"` panel at form width. It has an Arimo h3 title, reassurance that saved work is safe, primary "Try again", secondary "Copy error details" (the digest reference, page and time), and a status line saying whether copying worked. It uses dashboard wording only, never the guest site's booking details.
- **Recovery code list** (`src/components/admin/account/recovery-code-list.tsx`): a two-column mono list in a hairline box, with a secondary "Copy codes" button and an announced status line. It is shared by setup and replacement.
- **Notices** (`src/components/ui/notice.tsx`): tinted info, success, warning and danger frames with a line icon, 2 px corners.
- **Status pills** (`src/components/admin/status-pill.tsx`): semantic tints (`success-50`/`-800` and so on). Success is green, never navy.
- **Toasts** (`src/components/admin/toast.tsx`): currently near-black (`neutral-900`) with white text, a Romaic Gold action and 4 px corners. They sit bottom centre above the tab bar, or bottom left of the content. The intended navy treatment is still open (see below).

### Operations dashboard (Phase 3)

- **One primary per view.** Each screen has one navy action: Check in (or Check out) on a booking, Record payment on its money page, Start (or Mark done) on a task, Make the booking on the form. Everything else is secondary or a ghost link. A second form on a page passes `submitVariant="secondary"` to ActionForm.
- **Calendar cells** (`src/app/admin/(dashboard)/calendar/page.tsx`): a state is a treatment, not just a hue. In the house is solid success-700 with white text; booked is a 2 px navy outline on white; a channel's stay is a 2 px dashed info outline; closed and maintenance nights are hatched (neutral or warning); a stay that's over is muted text on a hairline. Each cell names its guest or reason, and on phones its state in words. The pinned unit column is 5.5 rem on phones (name only) and 12 rem from 640 px.
- **Today** puts the parts with something in them first; empty parts share one "Nothing else today" panel, a line each.
- **Money ledger** (`src/components/admin/money/money-screen.tsx`): the booking's money reads like its receipt: Total, Paid so far, then Balance still to pay in bold, amounts right-aligned in tabular figures, with the deposit on one line below. No big-number tiles.
- **List rows on phones** keep fixed lines: who and where with the status pill on line 1; the dates (year only when it isn't this year's) on line 2; the source left and the price right on line 3.
- **Settings rows** (Rates, Channels): one row per thing with its current state in words; a channel's switch saves as it's flipped (with Undo in the toast); a rate opens in a sheet (`src/components/admin/sheet-form.tsx`). No card per item, no cards inside cards.
- **Tabs on phones** (`src/components/admin/tabs.tsx` with `tabs-scroller.tsx`): the bar scrolls inside itself, the current tab is centred when the page opens, and a fade shows there's more. Still links with `aria-current`, not ARIA tabs.
- **Books and Tax (Phase 4)**: money reads in words, never with a minus sign ("R65 out", "Loss since 1 Mar", "The books show R65 more than the bank"); statement totals sit under a 2 px Romaic Gold rule (structure, beside the bold total); a return past its due date carries a danger pill in words ("Late: was due Fri 6 Nov") and sits under "Late" above "Coming up"; every tax figure shows its sars.gov.za source and checked date, with the long quote folded into "What the page says".
- **Reports and Privacy (Phase 5)**: a report opens with one plain sentence of the period's figures, then panels of ledger rows and one-series SVG charts (Decision 20), each with "How this is counted" folded away and its CSV link in the same place; on phones a wide table becomes ledger rows per period. Privacy pages name things for the owner ("Information requests", not "Requests", which is bookings'); the anonymise action on a guest's page is a quiet danger link, the filled danger button only in its confirm dialog; each legal duty quoted on a page shows its source and the day it was checked. The public notice keeps the Information Officer's details inside its own "Information Officer" section, or a marked gap.
- **Task cards**: Start leads while a task is to do, Mark done once it's started; Add photo is secondary and Add note a ghost link; Change and Remove wait behind "Change". On Today a card shows only its next step and Add photo.

### Logo slot
`src/components/ui/logo-slot.tsx`. A dashed gold-edged placeholder at the logo's real proportions and minimum sizes: wordmark 240 px at 3.4:1, lockup 5.6:1, corner mark 110 px at 2.4:1. It is marked `data-placeholder="logo"` and labelled "logo files to come". The dashboard sidebar and the sign-in pages use it; the public header no longer does (Decision 22), and the design preview shows it in its Logo section.

## Do's and Don'ts

### Do:
- **Do** let the photographs carry the space: large, close together, with bands only as tall as their content.
- **Do** set display headings in Josefin Sans light, sentence case, tracked no wider than 0.04em, and read text in Arimo.
- **Do** frame the large photos (the house photo, a room's lead photo) with the offset gold hairline, and nothing else.
- **Do** mark every stand-in on its own face with the quiet caption, and every unconfirmed fact with "To confirm".
- **Do** use Gold Text for gold type and icons on light grounds; Romaic Gold on navy or as a rule.
- **Do** wrap navy surfaces in `.on-dark` so text, links, hairlines and the focus ring flip together.
- **Do** give every control a 44 px target on phones and a visible gold focus ring.
- **Do** keep public-site styling under `.theme-site` (or the `site:` variant on shared components), so the dashboard never changes with it.
- **Do** keep motion to transform and opacity, and stop it under `prefers-reduced-motion`.

### Don't:
- **Don't** bring back the gold gradient heading bar, upper-case tracked headings, the 4 px gold photo border or the dashed logo box on the public site.
- **Don't** fill a button with gold on a light ground, or use Romaic Gold or Deep Gold as text on Paper, Cream or white.
- **Don't** retype the logo (black ROMAIC with a gold script "Guesthouse") or redraw the corner marks; the header names the business as plain text until the files arrive.
- **Don't** stretch a section to fill a screen, or add a band with no content of its own.
- **Don't** use the corner-mark accents (purple, coral, teal) as UI colours.
- **Don't** put a decorative eyebrow label above a heading. The hero's address line is the one line above a headline, and it's a fact, not a label.
- **Don't** imitate the marble texture or the palm leaf in CSS.
- **Don't** state facts the content doesn't: no "family-run", no reply times, no prices but the rates' own (Decision 9).
- **Don't** call them apartments in anything a guest reads.

## Decisions and conflicts

1. **The calibration warning vs the brief.** Cream, gold and a serif-adjacent display face sit close to a look AI tools default to. The client's brand guide pins all three, so impeccable's rule that the brief wins applies. *(Phase 1. On the public site the premium direction answers it differently: midnight navy, light Josefin and large real photographs rather than a cream-and-gold poster; see 21.)*
2. **Text on gold bars.** The brand guide sets it in bold Arimo. *(Superseded on the public site by 21: the gold bar is retired.)*
3. **No eyebrows.** impeccable bans eyebrow labels above headings. *(Still holds, with one exception the approved mock-up makes: the hero's address line, in gold with a short rule, sits above the headline. It's the address, a fact a guest needs, not a section label.)*
4. **Font weights above 600.** The brand guide pins Arimo 700 for subheads and labels (p6). *(Holds in the dashboard. On the public site bold Arimo is left to links and inline emphasis; titles and labels are Josefin 400–600.)*
5. **One interactive hue.** Navy on light grounds, Cream or light outlines on navy. *(Changed on the public site by 21: gold fills the booking button on navy (the header, the phone menu, the dock's main action). On light grounds navy stays the only filled colour.)*
6. **Logo.** The brand forbids retyping the wordmark (p4), and the PNG files haven't arrived. `LogoSlot` holds the place in the dashboard sidebar and on the sign-in pages. *(The public header changed in 22.)*
7. **Photos.** Labelled stand-ins until the client's photos arrive; alt text never says a stand-in is Romaic; sources in `public/stand-ins/SOURCES.md`. *(The label changed from a navy badge to a quiet caption in 23.)*
8. **Marble and palm leaf.** Not imitated in CSS; the palm leaf waits for the client's asset. The public site no longer uses marble panels.
9. **Solar backup power.** Never shown: only the Booking.com listing claims it.
10. **Phone dock actions.** "Check dates | WhatsApp"; Call | WhatsApp on the Book pages; none on the confirmation page; shown only once the page's own booking action has scrolled away. *(The main action is now gold, the other a light outline.)*
11. **Dates search on the home page.** It submits to the Book page rather than filtering in place, because availability is checked on the server. *(Since 21 it is the availability bar over the hero's foot, and its button says "Check availability".)*
12. **"To confirm" over leaving facts out.** Unverified listing facts are shown with the mark rather than hidden; the owner clears each in the dashboard. *(The mark is restyled in 23.)*
13. **No embedded map and no inner-page hero photos.** Location links to the guest's own map apps; inner pages' headings carry no photo, because the only photos are stand-ins. Still true; the inner pages' space comes from their own photos (rooms, a room, the gallery).
14. **The calendar is a table.** *(Phase 3, dashboard.)* Units are rows and nights are columns, two weeks at a time; a stay is one cell spanning its nights; on phones the table scrolls inside its own frame with the unit column pinned.
15. **Guests are found, not browsed.** *(Phase 3.)* The Guests page is a search, with no list of everyone (POPIA).
16. **WhatsApp messages are drafts.** *(Phase 3.)* Nothing is sent by itself; the wording is owner-only content.
17. **A booking's page puts what happens next first.** *(Phase 3.)*
18. **The books speak plainly.** *(Phase 4.)* Words, not minus signs; ledger rows, not tiles; every report says who it's for.
19. **A source beside every tax figure.** *(Phase 4.)*
20. **Reports chart one thing at a time.** *(Phase 5.)* Hand-written SVG, one series in `#245e93`, a visually hidden table with the same figures, and "How this is counted" folded away.
21. **The premium direction (2026-11-13).** Weberu approved "a gold-town guesthouse after dark" for the public site (`docs/planning/proposals/premium/index.html`), and it replaces the classic poster recipe there: navy, gold hairlines, Josefin light, large photos, square corners, a navy footer that takes in the contact bar. The live site has six pages the one-page mock-up doesn't, so the header keeps all of them; with six links the name moves from the mock-up's centre to the left (six links don't fit either side of a centred name below a very wide screen), and the links show from 1200 px. The mock-up's booking form becomes a closing invitation to book, because a real request needs a chosen, available room (the Book page).
22. **The name in the header.** The dashed "Logo files to come" box is out of the public header until the client's files arrive. The header names the business from content in Josefin Sans 400, the same face as the site's titles. That is the name set as text, not an imitation of the logo (which is black capitals with a gold script "Guesthouse"), so the brand's rule against retyping the wordmark (p4) is kept. The logo files replace it when they arrive.
23. **Honesty marks, quietly.** The navy "Stand-in photo · Pexels" badge becomes a small light caption on a soft shadow along the photo's bottom edge, still on every stand-in (the mock-up's single footer note wasn't enough for a live site whose photos the owner swaps one by one). "To confirm" becomes a small gold Josefin note with a dashed underline instead of a dashed box. Both mechanisms, and their `data-placeholder` marks, are unchanged.
24. **Two optional home fields.** The mock-up's house photo and evening band had no content. `home.highlights.photo` (an image) and `home.evenings` (heading, introduction and up to two photos) were added to the schema as optional, with defaults in `src/content/home.ts`; the content service lays stored sections over the defaults, so content saved earlier reads with them and no migration is needed (`src/lib/content/service.test.ts`). The evening band's default words claim only the client's own fact (enclosed parking on the property): the courtyard, garden and braai are listing facts still to confirm, so they aren't named. Its times come from the house rules, with their marks. The dashboard's home editor shows both: the house photo under Highlights, and an Evenings part with its heading, introduction and up to two photos (the first shown large, the second small). Its parts follow the page's order. Removing both evening photos is kept as a band with words and times only; the defaults' photos don't come back.
25. **The welcome line closes the page.** The hero's "Welcome home" line (`home.hero.welcome`) was a Sacramento accent; the premium direction has no script, so it now heads the closing invitation to book, falling back to the Book page's heading when it's empty. Sacramento is no longer used on the public site. In the home editor it's the last part, "Invitation to book", and its limit is named `closingHeading` (it was `script`; the headline's `goldBar` limit is now `heroHeadline`).
26. **Highlights without icons on the home page.** The mock-up's facts list is words only, so the highlights' icons aren't shown there; the Facilities page still shows every amenity's icon. The home editor no longer asks for one: each highlight keeps the icon it has, and a new one takes a default nobody sees. The section's history lists highlights without icons.
27. **One entrance, in CSS.** The home hero's photo settles from 106% (2.2 s) and its words rise 16 px into place (1.1 s, staggered 0.15 s), by transform and opacity, from CSS keyframes that run only under `prefers-reduced-motion: no-preference`; the global reduced-motion rule stops them too. They play on load, which an entrance must, so they aren't behind the motion gate; no script loads for them. The motion gate (`src/components/site/motion-gate.tsx`) is kept for interaction-gated motion, and nothing listens to it now that the gold sweep is gone.
28. **The browser bar matches the header.** The public site's layout sets `themeColor` to Midnight Navy; the dashboard keeps the root layout's Cream.
29. **Josefin as one variable file.** The brief asked for Josefin's light weight; the variable font already carried it (100–700), so the config names it `weight: "variable"` (next/font's types don't accept a "300 700" range). A list of static weights would download a file per weight.

## Placeholders waiting on the client

Each of these is clearly marked and is replaced as soon as the client supplies it:
- **Logo PNGs:** the wordmark, corner marks A and B, the primary lockup and the Cream-plate version. Meanwhile the public header names the business as text (Decision 22) and the dashboard shows `LogoSlot` (`data-placeholder="logo"`).
- **Original photos:** high-resolution photos of the real rooms and property. Meanwhile stand-ins with their quiet caption (`data-placeholder="photo"`), including the hero, the house photo, the evening band's two photos, every room and the gallery.
- **Palm-leaf asset:** not shown at all until it arrives.
- **Facts to confirm:** room details, house rules, check-in and check-out times, nearby distances and the listing's extra facilities, each marked "To confirm" until the owner ticks it off.
- **Booking terms:** deposit, balance, cancellation and payment, shown as "Still to be confirmed by the owner" until set.
- **Prices:** "Price on request" wherever a room has no rate; "From R… a night" comes only from the rates (the demo database's R850 is a test rate).

## To apply in the dashboard

These items are still **open**. Done since the interim record: the `forest-*` migration in components, the tab bar's gold rule, `CodeInput` in two-step sign-in, `LogoSlot` in the dashboard, Arimo page titles, and the home editor's house photo, Evenings part and wording for the premium design.

1. **Open: remove the `forest-*` aliases.** No component uses them any more. They remain only in `src/app/globals.css` (and its comment), and can go.
2. **Open: remove `font-stretch-semi-expanded`.** It was Archivo's width axis and does nothing now. It survives in `src/components/ui/prose.tsx` (heading levels 2 and 3); the dashboard files are clear.
3. **Open: toasts.** The intended treatment is a navy background, white text and a gold check icon for success, with `danger-700` for errors. `src/components/admin/toast.tsx` still uses `neutral-900` for both tones, without the icon, and its comment still mentions a "forest action".
4. **Open: dev server.** Use `http://localhost:<port>`, not `127.0.0.1`. Next's dev cross-origin protection refuses the hot-reload socket from `127.0.0.1`, and pages then never hydrate. To allow it, add `allowedDevOrigins: ["127.0.0.1"]` to `next.config.ts` (not set yet).
