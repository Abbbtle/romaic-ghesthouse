import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { romaicFacts } from "@/components/site/romaic-facts";

export const alt = "Romaic Guesthouse: a secure guesthouse in Welkom";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The site's colours (globals.css): Midnight Navy, On Navy, On Navy 2 and Romaic Gold. */
const navy = "#111d29";
const onNavy = "#f3efe6";
const onNavy2 = "#b8bec7";
const gold = "#cba959";
/** Gold hairlines on navy, as the footer's top edge draws them. */
const goldHairline = "rgb(203 169 89 / 0.35)";

/**
 * The site's own type, as static Latin TTFs (the image renderer can't read the
 * WOFF2 files next/font serves): Josefin Sans light for the headline, 400 for
 * the name and the number, 600 for the label, and Arimo for the address.
 * Licences are beside them in assets/fonts. Read once, at build time.
 */
const fontFile = (name: string) => readFile(join(process.cwd(), "assets/fonts", name));
const [josefinLight, josefinRegular, josefinSemiBold, arimo] = await Promise.all([
  fontFile("JosefinSans-Light.ttf"),
  fontFile("JosefinSans-Regular.ttf"),
  fontFile("JosefinSans-SemiBold.ttf"),
  fontFile("Arimo-Regular.ttf"),
]);

/**
 * The picture a link to the site shows when it's shared (WhatsApp, Facebook
 * and the like), in the premium design: a navy field like the header, footer
 * and evening band; the name as the header sets it; a short gold rule over the
 * headline in Josefin Sans light, sentence case; and, under a gold hairline,
 * the address and the number to WhatsApp or call. No photo, because the only
 * photos so far are stand-ins, which must never stand for Romaic, and no logo,
 * which mustn't be retyped (the real files replace the name here once they
 * arrive). Made once at build time from the brand guide's facts.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 80px 56px",
          background: navy,
          color: onNavy,
          fontFamily: "Josefin Sans",
        }}
      >
        <div style={{ fontSize: 32, fontWeight: 400 }}>{romaicFacts.name}</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
          <div style={{ width: 64, height: 2, background: gold }} />
          {/* Two set lines, as the site's balanced headings break it; the renderer can't balance. */}
          <div style={{ display: "flex", flexDirection: "column", fontSize: 104, fontWeight: 300, lineHeight: 0.98, letterSpacing: "-0.01em" }}>
            <span>A secure guesthouse</span>
            <span>in Welkom</span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            paddingTop: 30,
            borderTop: `1px solid ${goldHairline}`,
          }}
        >
          <div style={{ fontFamily: "Arimo", fontSize: 26, color: onNavy2 }}>{romaicFacts.addressLine}</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
            <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "0.04em", color: gold }}>WhatsApp or call to book</div>
            <div style={{ fontSize: 34, fontWeight: 400 }}>{romaicFacts.phone.display}</div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Josefin Sans", data: josefinLight, weight: 300, style: "normal" },
        { name: "Josefin Sans", data: josefinRegular, weight: 400, style: "normal" },
        { name: "Josefin Sans", data: josefinSemiBold, weight: 600, style: "normal" },
        { name: "Arimo", data: arimo, weight: 400, style: "normal" },
      ],
    },
  );
}
