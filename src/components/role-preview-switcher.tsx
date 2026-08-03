'use client'

/**
 * "View as" — lets HR see the app as another role to check it behaves.
 *
 * The whole app already resolves an `hr_preview_role` cookie server-side; what
 * was missing was anything to set it, and a layout effect that wiped the cookie
 * on every navigation, so a preview never survived a single click.
 *
 * Reads the cookie itself rather than taking a prop, because while previewing
 * the server hands the shell the *effective* role — so once you are viewing as
 * EMPLOYEE, a prop-driven control would hide itself and strand you there. The
 * cookie is the one thing that still says "this is a preview".
 *
 * Preview is view-only by design: the write paths check for the cookie and
 * refuse, so this cannot be used to act as someone else.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, X, ChevronDown } from 'lucide-react'

const ROLES = [
  { value: 'EXECUTIVE', label: 'Executive' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'LEAD', label: 'Lead' },
  { value: 'EMPLOYEE', label: 'Employee' },
]

const COOKIE = 'hr_preview_role'

function readCookie(): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))
  return m ? decodeURIComponent(m[1]) : null
}

export default function RolePreviewSwitcher({ role }: { role: string }) {
  const router = useRouter()
  const [preview, setPreview] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Read after mount: the cookie is not available during SSR, and rendering a
  // different tree on the server would hydrate-mismatch.
  useEffect(() => {
    setPreview(readCookie())
    setMounted(true)
  }, [])

  function enter(value: string) {
    // Session-length only. A preview that outlived the tab would be a very
    // confusing way to discover you have no permissions tomorrow morning.
    document.cookie = `${COOKIE}=${value}; path=/; max-age=3600; SameSite=Lax`
    setPreview(value)
    setOpen(false)
    router.refresh()
  }

  function exit() {
    document.cookie = `${COOKIE}=; path=/; max-age=0; SameSite=Lax`
    setPreview(null)
    setOpen(false)
    router.refresh()
  }

  if (!mounted) return null

  if (preview) {
    const label = ROLES.find((r) => r.value === preview)?.label ?? preview
    return (
      <button
        onClick={exit}
        title="Return to your own access"
        className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-xs font-medium px-3 py-1.5 hover:bg-amber-200"
      >
        <Eye className="w-3.5 h-3.5" />
        Viewing as {label}
        <X className="w-3.5 h-3.5" />
      </button>
    )
  }

  // Only real HR can start a preview. While previewing the branch above runs,
  // so the exit route is never hidden by this check.
  if (role !== 'HR_ADMIN') return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 text-slate-700 text-xs px-3 py-1.5 hover:bg-slate-50"
        title="See the app as another role"
      >
        <Eye className="w-3.5 h-3.5" /> View as <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-50 w-52 bg-white border border-slate-200 rounded-lg shadow-lg py-1">
            <p className="px-3 py-1.5 text-[11px] text-slate-500 border-b border-slate-100">
              Read-only preview
            </p>
            {ROLES.map((r) => (
              <button
                key={r.value}
                onClick={() => enter(r.value)}
                className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                {r.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
