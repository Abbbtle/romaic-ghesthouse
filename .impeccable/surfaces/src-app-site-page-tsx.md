---
version: 2
slug: "src-app-site-page-tsx"
primary_target: "src/app/(site)/page.tsx"
related_targets: ["src/app/(site)", "src/components/site", "src/app/kit/page.tsx"]
---

# Public site: home, every public page and /kit

**Mode:** Persuade. Guests decide to book direct.

**Scope:** the whole public site (home, Rooms, a room, Book and its confirmation, Facilities, Gallery, Location, Contact, House rules, the privacy notice, loading, 404 and error pages) and the public view of /kit. The dashboard (/admin) is out of scope and keeps its own look.

**Audience and job:**

- work travellers (business, contractors) and families visiting Welkom, mostly on phones, comparing against Booking.com;
- job: check whether a room is free and fits, see it's safe and keeps working, then book or message.

**Action:** dates and guests in the availability bar, then "Check availability" (the Book page lists the rooms that fit and takes the request). WhatsApp, call or email from the footer, the phone menu and the dock.

**Proof:**

- the client's own amenities (brand guide): rooms with kitchenettes; fast always-on Wi-Fi; microwave, fridge, iron and board; 3 L drinking water; coffee, tea and cookies; backup gas geysers; 2 JoJo tanks; electric fence; security cameras; an enclosed property; parking; walking distance to the CBD;
- real photos once supplied, quietly labelled stand-ins until then; listing facts marked "To confirm".

**Constraints:**

- Brand colours and faces from the client's guide: Midnight Navy, Romaic Gold, Cream, Josefin Sans and Arimo.
- Logo files are pending: the header names the business as plain text, never an imitation of the logo; the dashed placeholder stays out of the public header.
- Every word from site content; no claims the content doesn't support; rooms, never apartments.
- Mobile LCP of 2.5 s or less; CSS of 30 KB gzipped or less; WCAG 2.2 AA; motion only by transform and opacity, and none under reduced motion.

**Must not feel like:** a generic hotel chain, safari-lodge clichés, or over-luxurious.

**Approved mock-up:** `docs/planning/proposals/premium/index.html` (Weberu, 2026-11-13).

**Unresolved:** logo PNGs; original photos; solar backup (unconfirmed, never shown); whether to name the owner; the dashboard's home editor doesn't show the house photo or the evening band yet.

## Direction contract

THESIS: A gold-town guesthouse after dark. Midnight navy and Romaic gold, large photographs framed with a gold hairline set off their edge, Josefin Sans light and large. Space comes from the photographs, never from stretched sections. It replaces the classic Cream poster recipe (gold frame bars, tracked capitals, thick gold photo borders) on the public site.

OWN-WORLD:
- Paper `#FAF8F3` and Cream `#ECE8DD` grounds; Midnight Navy `#111D29` for the header, the evening band, the footer and the phone dock; navy ink and cool greys (`#4A4F57`) for text.
- Romaic Gold `#CBA959` as hairlines, 2 px rules over info blocks, the offset frame on the large photos, labels on navy, and the booking button on navy; Gold Text `#74561C` for gold type on light.
- Josefin Sans 300 for display headings in sentence case, tracked no wider than 0.04em; Josefin 400-600 for titles, labels, buttons and the nav; Arimo at 17 px for reading.
- Square corners; flat surfaces; one soft shadow under the availability bar.

STORY: The visitor sees a warm room after dark and the address, 286 Stateway in Bedelia, Welkom. They believe the house keeps working (backup water and hot water, Wi-Fi that stays on, a fenced, camera-watched, enclosed property with parking), see every room with its price or "Price on request", know when to arrive and leave, and can find their way. They check availability, or WhatsApp, call or email.

FIRST VIEWPORT: Phone, 390 px: the navy header (the name, "Menu"); the photograph full width under navy gradients with the gold address line, the headline and the introduction; the availability bar's arrive and leave cells starting at the photograph's foot. Desktop: the header transparent over the photograph with the six pages and the gold "Check availability"; the words at the bottom left; the bar across the photograph's foot.

Signature: the offset gold hairline around the large photos, and the address set huge as the heading of "Getting here". Motion: the hero's photo settles and its words rise once on load (CSS only); none under reduced motion.

FORM: The premium direction, approved by Weberu on 2026-11-13, replacing the classic layout chosen on 2026-11-12.

FINISH: unreviewed and undocumented is unfinished; DESIGN.md records the shipped system.
