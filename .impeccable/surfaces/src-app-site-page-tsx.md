---
version: 1
slug: "src-app-site-page-tsx"
primary_target: "src/app/(site)/page.tsx"
related_targets: ["src/app/kit/page.tsx"]
---

# Public site: home, holding page and /kit

**Mode:** Persuade. Guests decide to book direct.

**Scope:**

- Phase 1: the holding page at "/" and the design system shown in /kit (public view, plus the dashboard view in Operate mode);
- Phase 2: the full public site.

**Audience and job:**

- work travellers (business, contractors) and families visiting Welkom, mostly on phones, comparing against Booking.com;
- job: check whether an apartment is free and fits, see it's safe and keeps working, then book or message.

**Action:** dates and guests, then "Show free apartments". Until Phase 2 it's WhatsApp, call or email from the contact bar.

**Proof:**

- the client's own amenities (brand guide): spacious apartments; fast always-on Wi-Fi; microwave, fridge, iron and board; 3 L drinking water; coffee, tea and cookies; backup gas geysers; 2 JoJo tanks; electric fence; security cameras; an enclosed area; parking; walking distance to the CBD;
- real photos once supplied, labelled stand-ins until then.

**Constraints:**

- The brand guide is pinned: palette, Josefin Sans / Sacramento / Arimo, gold frame bars, thin gold photo frames, cream and marble fields, a navy contact bar at the bottom, a palm-leaf watermark used sparingly.
- Logo files are pending: use a placeholder slot, and never retype the wordmark.
- Mobile LCP of 2.5 s or less; CSS of 30 KB gzipped or less; WCAG 2.2 AA; no motion before interaction or under reduced motion.

**Must not feel like:** a generic hotel chain, safari-lodge clichés, or over-luxurious.

**References (craft bar only):** The Menhaden (persistent booking dock), Relais Rossar (warm, framed restraint), Grano Hotels (dates picker as the hero's working action). See `docs/planning/design-references.md`.

**Unresolved:** logo PNGs; original photos; solar backup (unconfirmed, never shown); whether to name the owner.

## Direction contract

THESIS: The classic accommodation page, done with total conviction in Romaic's own brand. A warm framed photo, the name, a working dates-and-guests search, then the apartments and what keeps working. It refuses the hotel-chain template's grey neutrality and full-bleed stock gloss. Every surface is Cream, gold-framed and navy-anchored, exactly as the client's poster does it.

OWN-WORLD:
- Cream `#ECE8DD` fields (about 50%) and Marble White panels behind text.
- Romaic Gold frame bars with the 100° gold gradient carrying headlines, and thin 3–4 px gold frames around every photo.
- Midnight Navy `#111D29` for the contact bar, dark panels and the mobile booking dock. Ink `#151316` for text. Deep Gold `#AA823A` for gold-coloured text on light.
- Josefin Sans 500/600 caps, tracked, for headings. Sacramento in gold, large and rare, as the only script accent. Arimo for body, amenities and labels.
- Corner marks and the wordmark appear only as the client's own files.
- Square-cornered controls with 2 px radius; gold rules as dividers; line icons in gold.

STORY: The visitor sees it's a real, warm guesthouse at 286 Stateway in Bedelia, Welkom, a walk from the CBD. They believe it's spacious, homely and secure: backup water and hot water, always-on Wi-Fi, a fenced and camera-watched property with parking. They pick dates and guests, or WhatsApp, call or email straight away.

FIRST VIEWPORT: Phone, 390 px:
- the logo slot centred at the top on Cream, at least 240 px wide;
- the address line, letter-spaced, below it;
- a gold-framed warm photo, inset with Cream margins (about 4:3);
- a gold frame bar headline, "SPACIOUS APARTMENTS";
- the dates-and-guests search as a white panel with large date numerals and a navy "Show free apartments" button;
- pinned to the bottom: the navy booking dock ("Apartments" | "WhatsApp"), with the contact bar closing the page.

On desktop: the photo on the right at 7/12, and the name, headline bar and search on the left. Primary action: the search button.

Signature interaction: the dates in the search set as large numerals. Choosing guests updates "Sleeps up to N" filtering in place, with no page jump. Motion: a single gold-bar sweep on the headline after first interaction only; none under reduced motion.

FORM: The category standard, played straight (canon), fifth on the ordered list. The client picked it on the choice page and you confirmed it on 2026-11-12. seed:cc90a5c466c1d34c

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
