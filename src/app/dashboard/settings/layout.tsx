'use client'

/**
 * Settings shell — the active section, plus a section picker on small screens.
 * Each settings section is its own route under /dashboard/settings/*.
 *
 * The section list lives in the app sidebar (SETTINGS_NAV in
 * dashboard-chrome.tsx). The mobile picker below mirrors it: My Account for
 * everyone, the organisation sections for HR only — it used to offer every
 * role HR's eight sections and none of their own.
 */
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

const PERSONAL = [
  { href: '/dashboard/settings/account',       label: 'Account' },
  { href: '/dashboard/settings/profile',       label: 'Profile' },
  { href: '/dashboard/settings/password',      label: 'Password' },
  { href: '/dashboard/settings/notifications', label: 'Notifications' },
  { href: '/dashboard/settings/preferences',   label: 'Preferences' },
] as const

// Same order as SETTINGS_NAV in dashboard-chrome.tsx: company, time, pay.
const HR_SECTIONS = [
  { href: '/dashboard/settings',                  label: 'Overview' },
  { href: '/dashboard/settings/organization',     label: 'Organization' },
  { href: '/dashboard/settings/departments',      label: 'Departments' },
  { href: '/dashboard/settings/users',            label: 'Users' },
  { href: '/dashboard/settings/roles',            label: 'Roles' },
  { href: '/dashboard/settings/working-days',     label: 'Working Days & Hours' },
  { href: '/dashboard/settings/holidays',         label: 'Holidays & WFH' },
  { href: '/dashboard/settings/leave-policies',   label: 'Leave Policies' },
  { href: '/dashboard/settings/time-tracking',    label: 'Time Tracking' },
  { href: '/dashboard/settings/salary-structure', label: 'Salary Structure' },
  { href: '/dashboard/settings/tax-slabs',        label: 'Income Tax Slabs' },
] as const

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [isHR, setIsHR] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => setIsHR(d?.user?.role === 'HR_ADMIN'))
      .catch(() => {})
  }, [])

  const sections = isHR ? [...PERSONAL, ...HR_SECTIONS] : [...PERSONAL]
  const current = sections.some((s) => s.href === pathname) ? pathname : ''

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Configure how Convertt HR works for your organization.</p>
      </div>

      {/* Mobile section picker — the app sidebar is collapsed on small screens. */}
      <div className="lg:hidden">
        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Go to settings section</label>
        <select
          value={current}
          onChange={(e) => { if (e.target.value) window.location.href = e.target.value }}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
        >
          {!current && <option value="">Choose a section</option>}
          {sections.map((s) => (
            <option key={s.href} value={s.href}>{s.label}</option>
          ))}
        </select>
      </div>

      <div className="min-w-0">{children}</div>
    </div>
  )
}
