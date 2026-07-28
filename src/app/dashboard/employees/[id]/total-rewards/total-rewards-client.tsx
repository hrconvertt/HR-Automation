'use client'

import { useEffect } from 'react'

/**
 * Auto-fires the browser print dialog once the Total Rewards page has
 * mounted — same pattern as the letters print page so HR/employee can
 * "Save as PDF" with one keystroke. Children are rendered verbatim.
 */
export function TotalRewardsClient({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Short timeout so the browser has rendered the document before printing.
    const t = setTimeout(() => {
      try { window.print() } catch { /* ignore */ }
    }, 350)
    return () => clearTimeout(t)
  }, [])
  return <>{children}</>
}
