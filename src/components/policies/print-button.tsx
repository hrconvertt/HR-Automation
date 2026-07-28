'use client'

import { Printer } from 'lucide-react'

/**
 * Triggers the browser's native print dialog. Lives in a client component
 * because the parent policy page is server-rendered and React blocks
 * `javascript:` URLs in forms.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
    >
      <Printer className="w-4 h-4" />
      Print
    </button>
  )
}
