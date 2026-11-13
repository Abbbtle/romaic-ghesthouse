/**
 * Shown at once when a guest moves between public pages, while the page's
 * content is read: the Cream band where the page's heading will sit, with a
 * quiet gold rule, and the words for screen readers. The header, footer and
 * contact bar stay in place around it. It's at least a screen tall, so the
 * footer waits below the fold instead of showing and then jumping away when
 * the page arrives (a layout shift of about 0.3 on a laptop screen).
 */
export default function SiteLoading() {
  return (
    <main id="main" aria-busy="true" className="min-h-svh flex-1">
      <div className="bg-cream">
        <div className="mx-auto grid max-w-page gap-5 px-[max(1rem,env(safe-area-inset-left))] py-section-sm">
          <div className="h-16 w-64 max-w-full bg-neutral-100" />
          <hr className="gold-rule w-24" />
          <p role="status" className="text-sm text-fg-3">
            Loading…
          </p>
        </div>
      </div>
    </main>
  );
}
