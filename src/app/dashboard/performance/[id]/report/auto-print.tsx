'use client'

import { useEffect } from 'react'

export function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400)
    return () => clearTimeout(t)
  }, [])
  return null
}

export function PrintButton() {
  return (
    <button
      type="button"
      className="print-btn"
      onClick={() => window.print()}
    >
      Print
    </button>
  )
}
