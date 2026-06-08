'use client'

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      style={{
        background: '#2563eb', color: '#fff', border: 'none',
        padding: '8px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13,
      }}
    >
      Print
    </button>
  )
}
