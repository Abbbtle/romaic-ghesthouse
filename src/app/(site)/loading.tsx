/**
 * Shown at once when a guest moves between public pages, while the page's
 * content is read: a quiet block where the page's heading will sit, a short
 * gold hairline, and the words for screen readers. The header and footer
 * stay in place around it. It's at least a screen tall, so the footer waits
 * below the fold instead of showing and then jumping away when the page
 * arrives (a layout shift of about 0.3 on a laptop screen).
 */
export default function SiteLoading() {
  return (
    <main id="main" aria-busy="true" className="min-h-svh flex-1">
      <div className="site-wrap grid gap-6 pt-[clamp(3rem,7vw,5.5rem)]">
        <div className="h-16 w-80 max-w-full bg-cream" />
        <div className="h-px w-12 bg-romaic-gold" />
        <p role="status" className="text-sm text-fg-3">
          Loading…
        </p>
      </div>
    </main>
  );
}
