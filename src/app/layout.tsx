import type { Metadata, Viewport } from "next";
import { Arimo, Josefin_Sans, Sacramento } from "next/font/google";
import { env } from "@/server/env";
import "./globals.css";

// The brand guide's typefaces (closest free matches to the poster's lettering,
// all SIL Open Font License). next/font downloads them at build time and serves
// them from this site, so pages never call Google and the CSP stays 'self'.
// Josefin Sans: the public site's display type, light (300) and large, and its
// labels and buttons at 400-600. Arimo: everything you read. Sacramento: rare,
// large, gold script accents only (the design preview), so it isn't preloaded.
// Josefin Sans and Arimo load as variable fonts, so every weight in between is
// real. Josefin's is named "variable" on purpose: its one file carries 100 to
// 700, including the light 300 the public site's headings use. A list of
// static weights would download a file per weight instead.
const josefin = Josefin_Sans({
  subsets: ["latin"],
  weight: "variable",
  variable: "--font-josefin",
  display: "swap",
});

const arimo = Arimo({
  subsets: ["latin"],
  variable: "--font-arimo",
  display: "swap",
});

const sacramento = Sacramento({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-sacramento",
  display: "swap",
  preload: false,
});

const siteName = "Romaic Guesthouse";

/**
 * Defaults for every page. Pages set their own titles and descriptions from
 * content; this gives them an absolute base for social images and a title
 * pattern. The address is read when first needed, like every other setting
 * (src/server/env.ts).
 */
export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(env.siteUrl()),
    title: {
      default: siteName,
      template: `%s | ${siteName}`,
    },
    applicationName: siteName,
    openGraph: {
      siteName,
      type: "website",
      locale: "en_ZA",
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#ece8dd",
  colorScheme: "light",
};

/**
 * The document, fonts and skip link shared by the whole app. The public pages
 * add the site header and footer in app/(site)/layout.tsx; the dashboard
 * brings its own shell. Either way, the page's <main> has id="main". No data
 * is read here: content comes from the layouts below.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-scroll-behavior lets Next.js switch smooth scrolling off while it
    // jumps to the top on a route change; without it the jump animates.
    <html lang="en-ZA" data-scroll-behavior="smooth" className={`${josefin.variable} ${arimo.variable} ${sacramento.variable}`}>
      <body className="flex min-h-svh flex-col bg-canvas font-sans text-fg">
        <a
          href="#main"
          className="sr-only rounded-sm bg-white px-4 py-3 text-base font-bold text-ink shadow-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[500]"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
