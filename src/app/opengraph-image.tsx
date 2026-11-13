import { ImageResponse } from "next/og";
import { romaicFacts } from "@/components/site/romaic-facts";

export const alt = "Romaic Guesthouse: a secure guesthouse in Welkom";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The picture a link to the site shows when it's shared (WhatsApp, Facebook
 * and the like): the client's poster recipe in type alone, a Cream field,
 * the headline in the gold bar and the navy contact bar along the bottom.
 * No photo, because the only photos so far are stand-ins, which must never
 * stand for Romaic, and no logo, which mustn't be retyped (the real files
 * replace the name here once they arrive). Made once at build time from the
 * brand guide's facts.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#ece8dd" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 80px", gap: 36 }}>
          <div style={{ fontSize: 40, fontWeight: 700, color: "#151316" }}>{romaicFacts.name}</div>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              padding: "22px 40px",
              background: "linear-gradient(100deg, #aa823a 0%, #e3ce74 38%, #cba959 62%, #aa823a 100%)",
              fontSize: 64,
              fontWeight: 700,
              color: "#151316",
            }}
          >
            A secure guesthouse in Welkom
          </div>
          <div style={{ fontSize: 30, letterSpacing: 6, color: "#151316", textTransform: "uppercase" }}>{romaicFacts.addressLine}</div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "28px 80px",
            background: "#111d29",
            borderTop: "6px solid #cba959",
            color: "#ffffff",
            fontSize: 30,
            fontWeight: 700,
          }}
        >
          <span style={{ color: "#cba959", letterSpacing: 5, fontSize: 24, textTransform: "uppercase" }}>WhatsApp or call to book</span>
          <span>{romaicFacts.phone.display}</span>
        </div>
      </div>
    ),
    size,
  );
}
