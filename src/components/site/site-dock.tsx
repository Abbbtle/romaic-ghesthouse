"use client";

import { CalendarDays, Phone } from "lucide-react";
import { usePathname } from "next/navigation";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";
import { DockReveal } from "./dock-reveal";
import type { SiteFacts } from "./site-facts";

/** The id a page gives its own booking action, so the dock waits until that has scrolled away. */
export const dockAfterId = "dock-after";

/**
 * The phone booking dock on every public page: "Check dates" and WhatsApp,
 * or Call and WhatsApp on the Book page itself, where checking dates is
 * what the page already does, and none on the confirmation page, whose own
 * buttons are the same two. It appears once the page's own booking action
 * (the element with id dockAfterId) has scrolled away; on a page without
 * one, as soon as scripts run.
 */
export function SiteDock({ facts }: { facts: Pick<SiteFacts, "whatsapp" | "phone"> }) {
  const pathname = usePathname();
  const onBookPage = pathname.startsWith("/book");
  // The confirmation page's own buttons are WhatsApp and Call: the dock would only repeat them.
  if (pathname === "/book/confirmed") return null;
  return (
    <>
      {/* Room at the foot of the page for the dock, so it never covers the contact bar's last line. */}
      <div aria-hidden="true" className="h-[calc(var(--dock-height)+env(safe-area-inset-bottom))] bg-midnight-navy lg:hidden" />
      <DockReveal
      afterId={dockAfterId}
      secondary={
        onBookPage
          ? { label: "Call", href: facts.phone.tel, icon: <Phone aria-hidden="true" strokeWidth={1.75} className="size-4" /> }
          : { label: "Check dates", href: "/book", icon: <CalendarDays aria-hidden="true" strokeWidth={1.75} className="size-4" /> }
      }
      primary={{ label: "WhatsApp", href: facts.whatsapp, external: true, icon: <WhatsAppGlyph tone="mono" className="size-4" /> }}
      />
    </>
  );
}
