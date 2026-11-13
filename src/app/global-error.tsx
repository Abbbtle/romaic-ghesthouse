"use client";

import { Arimo, Josefin_Sans } from "next/font/google";
import { ServerErrorMessage, StandaloneErrorPage } from "@/components/site/status-views";
import "./globals.css";

// The root layout's faces, loaded again: this page replaces the root layout,
// so it brings its own document, styles and fonts (Next.js global-error).
const josefin = Josefin_Sans({ subsets: ["latin"], variable: "--font-josefin", display: "swap" });
const arimo = Arimo({ subsets: ["latin"], variable: "--font-arimo", display: "swap" });

type GlobalErrorProps = {
  error: unknown;
  /** Fetches and renders the app again. */
  retry: () => void;
};

/** The last resort, when the root layout itself fails: a whole document with the logo slot and a way to try again. */
export default function GlobalError({ retry }: GlobalErrorProps) {
  return (
    <html lang="en-ZA" className={`${josefin.variable} ${arimo.variable}`}>
      <body className="flex min-h-svh flex-col bg-canvas font-sans text-fg">
        <title>Something went wrong</title>
        <StandaloneErrorPage>
          <ServerErrorMessage retry={retry} />
        </StandaloneErrorPage>
      </body>
    </html>
  );
}
