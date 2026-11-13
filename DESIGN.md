---
name: Romaic Guesthouse
description: Spacious apartments in Welkom, in the client's own Cream, gold and navy brand.
colors:
  romaic-gold: "#cba959"
  deep-gold: "#aa823a"
  champagne: "#e3ce74"
  gold-text: "#74561c"
  midnight-navy: "#111d29"
  navy-hover: "#1e2f40"
  ink-black: "#151316"
  cream: "#ece8dd"
  canvas: "#faf8f3"
  chalk: "#f3f0e8"
  white: "#ffffff"
  marble: "#eef1f7"
  fg-2: "#4a453b"
  fg-3: "#5c5649"
  control: "#77705f"
  crimson: "#be042a"
  success: "#1f6b57"
typography:
  hero:
    fontFamily: "Josefin Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2rem, 1.45rem + 2.6vw, 3.5rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "0.1em"
  headline:
    fontFamily: "Josefin Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 1.3rem + 0.9vw, 2.0625rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "0.08em"
  gold-bar:
    fontFamily: "Arimo, Arial, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.625rem, 1.25rem + 1.6vw, 2.5rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.005em"
  title:
    fontFamily: "Arimo, Arial, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.25rem, 1.17rem + 0.35vw, 1.4375rem)"
    fontWeight: 700
    lineHeight: 1.25
  admin-title:
    fontFamily: "Arimo, Arial, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 1.3rem + 0.9vw, 2.0625rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "0em"
  body:
    fontFamily: "Arimo, Arial, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  lead:
    fontFamily: "Arimo, Arial, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.0625rem, 1.02rem + 0.2vw, 1.1875rem)"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Josefin Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    letterSpacing: "0.14em"
  script:
    fontFamily: "Sacramento, cursive"
    fontSize: "clamp(2.25rem, 1.8rem + 2vw, 3.5rem)"
    fontWeight: 400
    lineHeight: 1.1
  date:
    fontFamily: "Josefin Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2rem, 1.8rem + 1vw, 2.75rem)"
    fontWeight: 600
    lineHeight: 1
rounded:
  xs: "2px"
  sm: "2px"
  md: "4px"
  lg: "8px"
  pill: "999px"
spacing:
  section: "clamp(3.5rem, 2.5rem + 4.5vw, 6.5rem)"
  section-sm: "clamp(2.5rem, 2rem + 2.5vw, 4rem)"
components:
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
  button-ghost:
    textColor: "{colors.midnight-navy}"
    padding: "0"
  button-ghost-hover:
    textColor: "{colors.gold-text}"
  button-on-dark:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.midnight-navy}"
    rounded: "{rounded.sm}"
    height: "44px"
  field:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink-black}"
    rounded: "{rounded.sm}"
    height: "48px"
    padding: "0 12px"
  gold-bar-heading:
    textColor: "{colors.ink-black}"
    typography: "{typography.gold-bar}"
    padding: "0.7em 1.1em 0.6em"
  marble-panel:
    backgroundColor: "{colors.marble}"
    padding: "24px"
  contact-bar:
    backgroundColor: "{colors.midnight-navy}"
    textColor: "{colors.white}"
  booking-dock:
    backgroundColor: "{colors.midnight-navy}"
    textColor: "{colors.white}"
    height: "64px"
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

> **Record status.** Written from the shipped Phase 1 design-system build on 2026-11-12, after the finish review, merging the interim record of the same date. Tokens above are normative.
>
> **Sources:**
> - tokens and recipes: `src/app/globals.css`;
> - fonts: `src/app/layout.tsx`;
> - type recipes: `src/components/ui/typography.ts`;
> - components: `src/components/ui/*`, `src/components/site/*`, `src/components/admin/*`;
> - live preview: `/kit` (`src/app/kit/*`);
> - direction contract: `.impeccable/surfaces/src-app-site-page-tsx.md`;
> - brand guide transcription (binding): `docs/planning/brand-guide-notes.md`, citing *Romaic Guesthouse Brand Guide*, Edition 1, November 2026, by page (p4, p5…).
>
> The section headings use the DESIGN.md format's fixed English names ("Colors"), which tools parse; the prose uses South African spelling.

## Overview

**Creative North Star: "The Client's Own Poster"**

- **Direction:** the classic accommodation page, which the client picked on 2026-11-12. It is played straight, at full craft, in the client's own brand (brand guide, Edition 1).
- **The poster recipe** (brand guide p10) drives every surface:
  - a Cream or marble field;
  - a gold-framed warm photo;
  - a gold headline bar;
  - bold Arimo amenities;
  - the Midnight Navy contact bar at the bottom edge.
- **Craft bar:** The Menhaden (persistent booking dock), Relais Rossar (warm, framed restraint) and Grano Hotels (dates picker as the hero's working action). See `docs/planning/design-references.md`.

The system is warm, square-shouldered and quiet. Gold is structure: bars, frames, rules and line icons. Navy does the work: actions, links, the contact bar and the phone dock. The public site is sparse and centred on phones and two-column on desktop. The dashboard is denser: white panels on a Chalk canvas, with Arimo titles. The brand's gold, navy and Cream come through there in small, exact doses.

The way out of the cream-and-gold look AI tools default to is fidelity to the client's poster, not a different palette (Decision 1). The direction contract rejects three looks: a generic hotel chain, safari-lodge clichés, and anything over-luxurious.

**Key Characteristics:**
- Cream grounds with Marble White panels; gold frames and rules; navy anchors at the foot.
- Josefin Sans capitals for headings and labels; Arimo for everything people read; Sacramento once, large and gold.
- 2–4 px corners everywhere, matching the square gold frames.
- Soft shadows under 8% opacity, always over an edge.
- One motion flourish, a gold sheen after first interaction, and none under reduced motion.
- Placeholders that say they are placeholders.

## Colors

The client's poster palette (brand guide p5), plus two derived greys and a gold that reads as text. All defined in `src/app/globals.css`.

### Primary
- **Romaic Gold** (`--color-romaic-gold`): frame bars, the 4 px photo frame, gold rules, the 2 px top edge of the contact bar and dock, icons on navy, the phone tab bar's current-tab bar. Never text on light grounds (1.8:1 on Cream).
- **Midnight Navy** (`--color-midnight-navy`, aliased `primary`, `link`, `focus`, `band`, `accent`): the primary button, links, the focus ring, the contact bar, the phone booking dock, tooltips. Hover goes to Navy Hover (`--color-navy-700`); pressed goes to `--color-navy-950`. The navy scale (`--color-navy-50` to `-950`) is in the same file.

### Secondary
- **Gold Text** (`--color-gold-text`, aliased `fg-brand`, `link-hover`): gold-coloured text and line icons on light grounds. Used for the Josefin label recipe, the Sacramento accent, amenity icons and link hover. It is 5.5:1 on Cream. It is darker than the brand's Deep Gold, which the guide names for gold text on light but which reaches only 2.9:1 on Cream.
- **Deep Gold** and **Champagne** (`--color-deep-gold`, `--color-champagne`): the gradient's shadow and highlight stops. Champagne is also the focus ring on navy, inline `mark` and text selection (`--color-mark`, `--color-selection`).
- **Gold gradient** (`--gradient-gold`, `src/app/globals.css`): 100°, `#aa823a` 0% → `#e3ce74` 38% → `#cba959` 62% → `#aa823a` 100% (brand guide p5). It fills gold bars and gold rules.

### Tertiary
- **Crimson** (`--color-crimson`, `--color-danger-600`): the brand's sparing accent, used here only as the error and destructive colour (danger button, invalid field borders, nav badges).
- **Corner-mark accents** (`--color-royal-purple`, `--color-coral`, `--color-teal`): defined for the corner marks only. They are never UI colours.
- **WhatsApp green** (`--color-whatsapp`): the WhatsApp glyph only, never text or fills.

### Neutral
- **Cream** (`--color-cream`, aliased `surface-2`): the main public ground (hero, header, footer), the logo plate on dark, and the sidebar's current-page tint. It is also the `themeColor` in `src/app/layout.tsx`.
- **Canvas** (`--color-canvas`, `--color-neutral-25`): the page background, and the "Where to find us" band.
- **Chalk** (`--color-chalk`, `--color-neutral-50`): the dashboard canvas, read-only and disabled fields, and nav hover.
- **Marble White** (`--color-marble`): flat panels behind text (see Decision 8).
- **White** (`--color-surface`, `--color-field`, `--color-raised`): fields, dashboard panels, cards, sheets, the sidebar.
- **Ink Black** (`--color-ink-black`, aliased `ink`, `fg`): headlines and body text. It is 15.1:1 on Cream.
- **Secondary text** (`fg-2` = `--color-neutral-700`; `fg-3` = `--color-neutral-600`): lead and supporting copy; meta, hints and placeholders. `fg-3` is 5.95:1 on Cream.
- **Control edge** (`--color-control`, `--color-neutral-500`): every interactive border. It is 4.0:1 on Cream; hover goes to `--color-neutral-800`.
- **Hairline** (`--color-hairline`, Ink at 12%): structure only (panel edges, header and footer borders). Never the only edge of a control.
- **Warm neutral scale** (`--color-neutral-25` to `-950`): "a whisper of gold in every grey".

### Named Rules
**The Gold Is Structure Rule.** Gold frames, divides and decorates. Navy (on light) and Cream (on navy) are the only interactive colours. No button, link or selected state is filled gold (Decision 5).

**The Text-Gold Rule.** Gold that must be read on a light ground is Gold Text, never Romaic Gold or Deep Gold.

**The On-Dark Rule.** Inside the `.on-dark` recipe (`src/app/globals.css`), the role colours flip by themselves: text white, secondary Cream, links white with Champagne hover, focus Champagne. Dark surfaces use the recipe rather than hand-set colours.

## Typography

**Display Font:** Josefin Sans (`--font-display`, falling back to ui-sans-serif)
**Body Font:** Arimo (`--font-sans`, falling back to Arial)
**Script Accent:** Sacramento (`--font-script`, falling back to cursive)
**Mono:** the system mono stack (`--font-mono`), for recovery codes and the code input only.

All three are self-hosted by next/font (`src/app/layout.tsx`). They are the brand guide's closest free matches (p6). Josefin Sans and Arimo load as variable fonts. Sacramento is not preloaded.

**Character:** tracked geometric capitals for the poster's voice, and a plain, sturdy grotesque for everything a guest or owner actually reads.

### Hierarchy
Recipes live in `src/components/ui/typography.ts` (`textStyles`); sizes in `src/app/globals.css` (`--text-*`, a 1.2 ratio on 16 px, fluid at display sizes).
- **Hero** (Josefin 600, `--text-hero`, 1.1, +0.1em, capitals): the page's one big headline when it isn't in a gold bar.
- **Headline, h1/h2** (Josefin 600, `--text-h1` / `--text-h2`, +0.08em, capitals): section headings on the public site ("Where to find us").
- **Gold-bar heading** (Arimo 700, ink, sentence case on the holding page): headlines inside the gold frame bar (`src/components/site/gold-bar-heading.tsx`). Hero size is `clamp(1.625rem, …, 2.5rem)`; section size is `clamp(1.25rem, …, 1.625rem)`.
- **Title, h3/h4** (Arimo 700, `--text-h3` / `--text-h4`): card and apartment titles, panel and dialog titles, sentence case.
- **Dashboard page title** (Arimo 700, `--text-h2` on desktop, `--text-h3` in the phone header bar, normal tracking): `src/components/admin/page-header.tsx`.
- **Body** (Arimo 400, 16 px, 1.6, max 65ch); **Lead** (`--text-lead`, `fg-2`, max 60ch); **Secondary** (14 px, `fg-2`); **Meta** (12 px, `fg-3`).
- **Label** (Josefin 600, 14 px, +0.14em, capitals, Gold Text): short labels inside a section, and the poster-row titles. The contact-bar label uses +0.22em in Romaic Gold on navy; the hero address line uses +0.24em in ink.
- **Script** (Sacramento 400, `--text-script`, Gold Text): "Welcome home". Large only (brand: never under 18 pt).
- **Numerals:** price (`--text-price`), stat (`--text-stat`) and date (`--text-date`, Josefin 600, `src/components/site/dates-search.tsx`), all tabular. Tables, `time` and `[data-numeric]` get tabular figures globally.

### Named Rules
**The One Script Rule.** Sacramento appears at most once per view, large and gold.

**The Bold Arimo On Gold Rule.** Text on a gold bar is bold Arimo in ink, never Josefin capitals (brand guide p8, p10; Decision 2).

**The Tracking Lives In Recipes Rule.** Letter-spacing belongs to the Josefin recipes, not the size tokens, so Arimo titles at the same sizes keep normal spacing.

## Layout

- **Containers** (`src/app/globals.css`):
  - `--container-page` (72rem) for the public site;
  - `--container-admin` (70rem);
  - `--container-form` (40rem) for forms and the dashboard error view;
  - `--container-prose` (42rem) for legal text.
- **Gutters:** side padding is `max(1rem, env(safe-area-inset-left))` on public pages.
- **Vertical rhythm:** `--spacing-section` and `--spacing-section-sm` separate bands.
- **Holding page** (`src/app/(site)/page.tsx`):
  - **Phones:** the gold-framed stand-in photo comes first as a 4:3 inset with Cream margins, then the centred text column. That column holds the gold-bar headline, the tracked address line, the lead, "Welcome home", then the booking block between two gold rules.
  - **From 1024 px:** a 12-column grid, with the photo on the right at 7/12 and the text left-aligned at 5/12.
  - **Amenity panel:** its own full-width row below the hero. One column on phones, divided by gold rules; three columns from 1024 px, divided by vertical gold rules.
  - **Below the panel:** a gold rule, then "Where to find us" on Canvas.
- **Chrome heights** (`:root` in `src/app/globals.css`): `--site-header-height` (4.25rem, 5rem from 64rem) and `--dock-height` / `--admin-tab-bar-height` (4rem). Pages that show the dock pad their foot by the dock height plus the home-indicator inset (`src/components/site/site-footer.tsx`).
- **Contact bar** (`src/components/site/contact-bar.tsx`):
  - **Phones:** stacked.
  - **From 640 px:** the links wrap in a row.
  - **From 1024 px:** two columns. The label and address sit on the left; three nowrap links (WhatsApp, Call, email) sit in one row on the right.
- **Dashboard** (`src/components/admin/admin-shell.tsx`):
  - **From 1024 px:** a 248 px white sidebar beside a Chalk canvas, with 32 px content padding.
  - **Below 1024 px:** a fixed bottom tab bar plus "More" sheet, a sticky 56 px white page-header bar, and 16 px padding.
  - **Scroll margins:** fields carry `scroll-mt-24 scroll-mb-44` (`src/components/ui/form-controls.ts`), and every link, button, summary and `[tabindex]` inside `[data-admin-shell]` gets `scroll-margin-top: 6rem; scroll-margin-bottom: 11rem`. Focus never lands under the sticky header, save bar or tab bar.
- **Touch targets:** 44 px minimum. Small buttons are 36 px visible with a 44 px hit area (`src/components/ui/button.tsx`).

## Elevation & Depth

The system is a hybrid: mostly flat tonal layering (Canvas, Cream, Chalk, White, Marble), with soft, warm, low-opacity shadows that always sit over a 1 px edge or a gold frame. Shadows are defined in `src/app/globals.css`.

### Shadow Vocabulary
- **shadow-1** (`0 1px 2px rgb(21 19 22 / 0.06), 0 1px 1px rgb(21 19 22 / 0.04)`): the photo frame, and the current segment in `Tabs`.
- **shadow-2** (`0 6px 16px -4px rgb(21 19 22 / 0.07), 0 2px 4px rgb(21 19 22 / 0.04)`): the marble amenity panel, the dates-search panel, the phone tab bar, the skip link.
- **shadow-3** (`0 18px 40px -12px rgb(17 29 41 / 0.075), 0 4px 10px rgb(17 29 41 / 0.05)`): sheets, dialogs, toasts.
- **shadow-sheet** (`0 -12px 32px rgb(17 29 41 / 0.075)`): the phone booking dock, lifting off the page.
- **Gold-bar bevel** (inset `0 1px 0` white 35% over inset `0 -1px 0` ink 12%): the only inner shadow, on `.gold-bar`.

### Named Rules
**The Edge First Rule.** Every shadow sits on something that already has an edge: a hairline, a control border or a gold frame. Shadows stay under 8% opacity on light grounds.

## Shapes

- **Corners:** square-shouldered, like the gold frames. `--radius-xs` and `--radius-sm` are 2 px (buttons, fields, notices, nav rows, the code input); `--radius-md` is 4 px (dashboard panels, cards, toasts, the error view). `--radius-lg` (8 px) is kept for overlays: the confirm dialog and the top of a bottom sheet. `--radius-pill` is used for nav badges, the live dot and the sheet grabber only.
- **Borders:**
  - every button has a 1.5 px border, transparent where no edge shows, so all buttons share one height and keep an edge in forced-colours mode;
  - fields have a 1 px control border;
  - the photo frame and marble panel have a 4 px solid Romaic Gold border;
  - the contact bar and dock have a 2 px Romaic Gold top edge;
  - the dates-search panel has a 4 px gold top border.
- **Rules:** `.gold-rule` is a 2 px band of the gold gradient. Gold rules replace grey hairlines as dividers on public surfaces. Inside the amenity panel the dividers are Romaic Gold at 60%, with a solid 1 px gold rule beside each row's text.
- **Icons:** lucide line icons, stroke 1.25–1.75, in Gold Text on light grounds and Romaic Gold on navy.

## Components

### Buttons
`src/components/ui/button.tsx` (`Button`, `ButtonLink`, `ButtonAnchor`, `buttonClasses`).
- **Shape:** gently squared (2 px), bold Arimo, 1.5 px border. Heights: lg 52 px (phone CTAs), md 44 px (the default), sm 36 px (with a 44 px hit area).
- **Primary:** navy with white text; one per view.
- **Secondary:** white with an ink border and ink text ("Call +27 76 957 9928" on the holding page).
- **Ghost / ghost-danger:** reads as a link, unpadded, **underlined at rest** (1 px, offset 4 px). Hover thickens the underline to 2 px and turns it Gold Text (danger: `danger-800`).
- **WhatsApp:** navy with white text and the WhatsApp glyph (`src/components/ui/whatsapp-button.tsx`).
- **On dark:** Cream on navy (`on-dark`), or a Cream/70 outline (`on-dark-secondary`, `whatsapp-on-dark`). The focus ring is Champagne.
- **Danger:** Crimson with white text, for confirm dialogs.
- **States:** colour transitions over 150 ms, and a 0.98 press scale (motion-safe only). Busy shows a spinner with the working label in the same grid cell, so the width holds. Disabled is `aria-disabled` at 50% opacity, never the `disabled` attribute.

### Inputs / Fields
`src/components/ui/form-controls.ts`, `src/components/ui/fields.tsx`, `src/components/ui/code-input.tsx`.
- **Style:** white field, 1 px control border, 2 px corners, 16 px text. Height is 48 px on the public site (comfortable) and 44 px in the dashboard (compact).
- **Focus:** the border turns the focus colour, plus the global 2 px offset navy ring.
- **Error / read-only / disabled:** the invalid border stays Crimson whatever else happens. Read-only and disabled fields sit on Chalk.
- **Custom controls:** the checkbox is navy-filled with a white tick, the radio a filled ring, and the select has a `fg-3` chevron (`@utility check-box`, `radio-dot`, `select-chevron` in `src/app/globals.css`).
- **Code input:** one 56 px mono field, tracked 0.35em, with a numeric keypad, one-time-code autofill and a recovery-code mode. It is used in two-step sign-in (`src/components/admin/account/mfa-code-form.tsx`).

### Gold-bar heading (signature)
`src/components/site/gold-bar-heading.tsx`, `.gold-bar` in `src/app/globals.css`. The gold gradient band holds the line the page is about, with the bevel described above and bold Arimo in ink. One per view. With `sweep`, the motion gate (`src/components/site/motion-gate.tsx`) plays a single 300 ms transform-and-opacity highlight across it after the visitor's first interaction. It never plays under reduced motion.

### Photo frame and stand-ins
`.photo-frame` (`src/app/globals.css`), `src/components/ui/photo.tsx`, `src/components/site/stand-in-photo.tsx`. Every photo wears a 4 px Romaic Gold frame with shadow-1 (brand guide p7). A stand-in shows "Stand-in photo · source" on its face, in a navy/90 caption at the bottom left, and is marked `data-placeholder="photo"`. Sources are listed in `public/stand-ins/SOURCES.md`.

### Marble panel
`.marble` (`src/app/globals.css`). Flat Marble White behind text, with no imitation veining. On the holding page it carries a 4 px gold border and shadow-2, with 24–32 px padding.

### Contact bar
`src/components/site/contact-bar.tsx`. A Midnight Navy band with a 2 px gold top edge that closes every public page (brand guide p8). It carries a tracked Josefin label in Romaic Gold, the address in Cream with a gold pin, and white bold links with gold line icons, each at least 44 px tall. The layout is described under Layout.

### Phone booking dock
`src/components/site/booking-dock.tsx`, `src/components/site/dock-reveal.tsx`. Two equal actions (Call outline, WhatsApp in Cream) on navy, with a 2 px gold top edge and shadow-sheet, and it is hidden from 1024 px. It appears only once the hero's booking buttons (`#book-now`) have scrolled out of view, read from their position on scroll. While hidden it is moved below the edge, `invisible`, `inert` and `aria-hidden`. It slides up over 200 ms, and simply appears under reduced motion. Before scripts run it stays hidden.

### Navigation
- **Public header** (`src/components/site/site-header.tsx`): Cream with a hairline foot, and the logo slot centred on phones. Nav links are tracked Josefin capitals in ink, with Gold Text and an underline on hover. A navy primary "book" button appears from 1024 px.
- **Footer** (`src/components/site/site-footer.tsx`): Cream, with the name in plain bold Arimo (never a retyped wordmark), the address, ©, and quiet links. The contact bar follows it.
- **Dashboard sidebar** (`src/components/admin/admin-nav.tsx`, `src/components/admin/admin-shell.tsx`):
  - **Logo slot:** the corner mark (`LogoSlot kind="corner-mark"`), over "Dashboard".
  - **Rows:** 44 px, Arimo 500, `fg-2`, with a Chalk hover.
  - **Current page:** a Cream (surface-2) tint, a semibold navy label and a Gold Text icon. There is no side stripe.
  - **Footer rows:** View website; Get help from Weberu; Account, as a labelled row with an icon and the name and role beneath it; Sign out.
- **Phone tab bar** (`src/components/admin/admin-nav.tsx`): white, with a 24 px icon over each label. The current tab has a navy label and a 3 px Romaic Gold bar along its top edge. "More" opens a bottom sheet.
- **Tabs** (`src/components/admin/tabs.tsx`): a segmented bar on `neutral-100`. The current segment is white with shadow-1.

### Cards, panels and dialogs
- **Dashboard panel / card** (`src/components/admin/panel.tsx`, `src/components/ui/card.tsx`): white (or Chalk), with a hairline border and 4 px corners. Panel headings are bold Arimo.
- **Confirm dialog** (`src/components/admin/confirm-dialog.tsx`): a native dialog on the navy scrim (`--color-backdrop`), 400 px wide, with 8 px corners and shadow-3. It has an h4 title, `fg-2` body and right-aligned actions. It is used before replacing recovery codes (`src/components/admin/account/recovery-codes.tsx`) and before discarding unsaved edits (`src/components/admin/save-bar.tsx`, "Discard changes").
- **Dashboard error view** (`src/components/admin/dashboard-error.tsx`, used by `src/app/admin/error.tsx` and `src/app/admin/(dashboard)/error.tsx`): a white `role="alert"` panel at form width. It has an Arimo h3 title, reassurance that saved work is safe, primary "Try again", secondary "Copy error details" (the digest reference, page and time), and a status line saying whether copying worked. It uses dashboard wording only, never the guest site's booking details.
- **Recovery code list** (`src/components/admin/account/recovery-code-list.tsx`): a two-column mono list in a hairline box, with a secondary "Copy codes" button and an announced status line. It is shared by setup and replacement.
- **Notices** (`src/components/ui/notice.tsx`): tinted info, success, warning and danger frames with a line icon, 2 px corners.
- **Status pills** (`src/components/admin/status-pill.tsx`): semantic tints (`success-50`/`-800` and so on). Success is green, never navy.
- **Toasts** (`src/components/admin/toast.tsx`): currently near-black (`neutral-900`) with white text, a Romaic Gold action and 4 px corners. They sit bottom centre above the tab bar, or bottom left of the content. The intended navy treatment is still open (see below).

### Logo slot
`src/components/ui/logo-slot.tsx`. A dashed gold-edged placeholder at the logo's real proportions and minimum sizes: wordmark 240 px at 3.4:1, lockup 5.6:1, corner mark 110 px at 2.4:1. It is marked `data-placeholder="logo"` and labelled "logo files to come".

## Do's and Don'ts

### Do:
- **Do** follow the poster recipe (brand guide p10): Cream or marble field, gold-framed photo, gold headline bar, bold Arimo amenities, navy contact bar at the foot.
- **Do** frame every photo with the 4 px Romaic Gold frame, and label every stand-in on its face.
- **Do** use Gold Text for gold-coloured type and icons on light grounds, and Romaic Gold only on navy or as structure.
- **Do** use gold rules (2 px gradient, or Romaic Gold at 60% inside panels) as dividers on public surfaces.
- **Do** wrap dark surfaces in the `.on-dark` recipe so links, focus and text flip together.
- **Do** keep every interactive border at the control colour (4.0:1), and give every control a 44 px target.
- **Do** gate motion behind first interaction and `prefers-reduced-motion`. Animate only transform and opacity.

### Don't:
- **Don't** retype the wordmark in any font, redraw the corner marks, or recolour, stretch, shadow or rotate the logo (brand guide p4). Use `LogoSlot` until the PNGs arrive.
- **Don't** fill buttons, links or selected states with gold. Gold is never interactive.
- **Don't** set gold-bar text in Josefin capitals.
- **Don't** use Romaic Gold or Deep Gold as text on Cream or white.
- **Don't** use the corner-mark accents (purple, coral, teal) as UI colours.
- **Don't** put eyebrow labels above headings. The brand guide's "02 — BRAND OVERVIEW" numbering stays in the PDF (Decision 3).
- **Don't** imitate the marble texture or the palm leaf in CSS.
- **Don't** mark the current nav row with a side stripe. Use the tint, the weight and the gold icon.
- **Don't** show a shadow without an edge beneath it, or above 8% opacity on light grounds.
- **Don't** state facts the client's own materials don't (Decision 9).

## Decisions and conflicts

1. **The calibration warning vs the brief.** Cream, gold and a serif-adjacent display face sit close to a look AI tools default to. The client's brand guide pins all three, so impeccable's rule that the brief wins applies, and the brand is followed exactly. The way out of the default is fidelity to the client's own poster recipe, not a different palette.
2. **Text on gold bars.** The brand guide sets it in bold Arimo ("Spacious Apartments", p8 and p10), not Josefin capitals. A first build used Josefin capitals and was corrected to match the guide. The holding page sets its bar in sentence case ("Spacious apartments in Welkom"); the guide's own sample is in title case.
3. **No eyebrows.** impeccable bans eyebrow labels above headings. The brand guide's "02 — BRAND OVERVIEW" style stays in the PDF. On the site, the address line sits below the headline.
4. **Font weights above 600.** The VectorLab typography skill caps weights at 600. The brand guide pins Arimo 700 for subheads, amenities and labels (p6). impeccable is the authority and the brief wins: bold Arimo stays.
5. **One interactive hue.** VectorLab asks for a single accent hue for interactive elements. Navy (on light grounds) and Cream (on navy) are the interactive colours. Gold is structural only: bars, frames, rules, decorative icons. The phone dock's primary action is Cream on navy, not gold.
6. **Logo.** The brand forbids retyping the wordmark (p4), and the PNG files haven't arrived. `LogoSlot` holds the place at the logo's real proportions and minimum sizes, marked `data-placeholder="logo"`:
   - the public header uses the wordmark slot;
   - the dashboard sidebar uses the corner-mark slot;
   - the sign-in pages use the wordmark slot.

   The footer names the business in plain bold Arimo, never a retyped wordmark. Corner marks are not redrawn.
7. **Photos.** Labelled stand-ins are allowed on the holding page, as the brief requires, until the client's photos arrive, and in `/kit`. Each uses `StandInPhoto`, with a visible "Stand-in photo" label and source and `data-placeholder="photo"`. The holding page shows one: a warm, gold-framed bedroom photo (Pexels 279746). It sits as an inset on phones and at the right 7/12 on desktop, and its alt text never says it is Romaic. Sources are in `public/stand-ins/SOURCES.md`. *(Changed: the interim record kept stand-ins off the public page.)*
8. **Marble and palm leaf.** `.marble` is flat Marble White, with no imitation veins, until the client's Carrara texture file arrives (brand guide p8). The palm-leaf watermark isn't used yet: it needs the client's asset, and the brand wants it sparingly. *(Changed: the interim record approximated marble in CSS.)*
9. **Solar backup power.** Never shown: only the Booking.com listing claims it, and the client's own materials don't.
10. **Phone dock actions.** The direction contract named "Apartments | WhatsApp". Phase 1 has no apartments page, so the dock offers Call | WhatsApp. It appears only once the hero's own booking buttons have scrolled away, so the first phone screen never offers the same two actions twice.
11. **Dates search on the holding page.** The contract's first viewport leads with the dates-and-guests search. Booking arrives in Phase 2, so the holding page books by WhatsApp, call or email. `DatesSearch` (`src/components/site/dates-search.tsx`) exists and is shown in `/kit` only.

## Placeholders waiting on the client

Each of these is a stand-in, clearly marked, and is to be replaced as soon as the client supplies the file:
- **Logo PNGs:** the wordmark, corner marks A and B, the primary lockup and the Cream-plate version. Shown meanwhile as `LogoSlot` (`data-placeholder="logo"`).
- **Original photos:** high-resolution photos of the real rooms and property. Shown meanwhile as labelled stand-ins (`data-placeholder="photo"`).
- **Marble texture:** the Carrara file. Shown meanwhile as flat Marble White.
- **Palm-leaf asset:** not shown at all until it arrives.

## To apply in the dashboard

These items are still **open**. Done since the interim record: the `forest-*` migration in components, the tab bar's gold rule, `CodeInput` in two-step sign-in, `LogoSlot` in the dashboard, and Arimo page titles.

1. **Open: remove the `forest-*` aliases.** No component uses them any more. They remain only in `src/app/globals.css` (and its comment), and can go.
2. **Open: remove `font-stretch-semi-expanded`.** It was Archivo's width axis and does nothing now. It survives in `src/components/ui/prose.tsx` (heading levels 2 and 3); the dashboard files are clear.
3. **Open: toasts.** The intended treatment is a navy background, white text and a gold check icon for success, with `danger-700` for errors. `src/components/admin/toast.tsx` still uses `neutral-900` for both tones, without the icon, and its comment still mentions a "forest action".
4. **Open: dev server.** Use `http://localhost:<port>`, not `127.0.0.1`. Next's dev cross-origin protection refuses the hot-reload socket from `127.0.0.1`, and pages then never hydrate. To allow it, add `allowedDevOrigins: ["127.0.0.1"]` to `next.config.ts` (not set yet).
