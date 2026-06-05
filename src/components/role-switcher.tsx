'use client'

import { useEffect, useState } from 'react'
import { Eye, Building2, UserCog, User, Crown } from 'lucide-react'

const ROLE_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; activeColor: string }> = {
  HR_ADMIN:  { label: 'HR',        icon: Building2, activeColor: 'text-blue-700 bg-blue-50' },
  MANAGER:   { label: 'Manager',   icon: UserCog,   activeColor: 'text-purple-700 bg-purple-50' },
  EMPLOYEE:  { label: 'Employee',  icon: User,      activeColor: 'text-emerald-700 bg-emerald-50' },
  EXECUTIVE: { label: 'Executive', icon: Crown,     activeColor: 'text-amber-700 bg-amber-50' },
}

// Display order
const ROLE_ORDER = ['HR_ADMIN', 'MANAGER', 'EMPLOYEE', 'EXECUTIVE']

function readCookie(): string {
  if (typeof document === 'undefined') return ''
  const m = document.cookie.match(/(?:^|;\s*)hr_preview_role=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : ''
}

interface Props {
  /**
   * The roles this user actually has. If only one, the switcher hides itself.
   * If empty, falls back to all four (legacy/HR_ADMIN behaviour).
   */
  availableRoles?: string[]
  /** The user's primary role (used as the "default view") */
  primaryRole?: string
}

export function RoleSwitcher({ availableRoles, primaryRole }: Props = {}) {
  const [current, setCurrent] = useState<string>('')

  useEffect(() => {
    setCurrent(readCookie())
  }, [])

  function setView(value: string) {
    if (value) {
      document.cookie = `hr_preview_role=${encodeURIComponent(value)}; path=/; max-age=3600; SameSite=Lax`
    } else {
      document.cookie = 'hr_preview_role=; path=/; max-age=0; SameSite=Lax'
    }
    window.location.reload()
  }

  // Determine which roles to show
  const roles = (availableRoles && availableRoles.length > 0)
    ? Array.from(new Set(availableRoles)).sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b))
    : ROLE_ORDER

  // If user has only one role, no need to show a switcher
  if (roles.length < 2) return null

  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-full p-0.5 border border-gray-200">
      <div className="flex items-center gap-1 pl-2 pr-1 text-[11px] font-medium text-gray-500">
        <Eye className="w-3.5 h-3.5" />
        <span className="hidden lg:inline">View as</span>
      </div>
      {roles.map((role) => {
        const meta = ROLE_META[role]
        if (!meta) return null
        const Icon = meta.icon
        // Empty cookie = primary role (the user's default view)
        const isActive = current === role || (current === '' && (primaryRole ?? 'HR_ADMIN') === role)
        return (
          <button
            key={role}
            type="button"
            onClick={() => setView(role === (primaryRole ?? 'HR_ADMIN') ? '' : role)}
            title={`View as ${meta.label}`}
            className={`
              flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all
              ${isActive
                ? `${meta.activeColor} shadow-sm`
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'}
            `}
          >
            <Icon className="w-3 h-3" />
            <span className="hidden xl:inline">{meta.label}</span>
          </button>
        )
      })}
    </div>
  )
}
