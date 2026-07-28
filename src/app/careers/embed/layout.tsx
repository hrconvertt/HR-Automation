/**
 * Embed layout — minimal HTML wrapper, transparent background so the
 * host page's colour theme shows through.
 *
 * Also sets `Content-Security-Policy: frame-ancestors *` via a meta tag
 * note in the route's HTML so it can be iframed by convertt.co and the
 * dev preview.
 */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[200px] bg-transparent">
      {children}
    </div>
  )
}
