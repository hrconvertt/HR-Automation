'use client'

/**
 * Settings shell — left sub-nav (desktop) / top dropdown (mobile).
 * Each settings section is its own route under /dashboard/settings/*.
 * Account/Profile/Password/Preferences are personal — they don't
 * appear in the HR org-settings rail; users reach them via the
 * top-right account menu.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2, Calendar, Calculator, Users, Plane,
  Mail, ShieldCheck, ClipboardList,
} from 'lucide-react'

const SECTIONS = [
  { href: '/dashboard/settings',                 label: 'Overview',              icon: Building2,    sub: 'All settings at a glance' },
  { href: '/dashboard/settings/organization',    label: 'Organization',          icon: Building2,    sub: 'Company name, tax IDs' },
  { href: '/dashboard/settings/working-days',    label: 'Working Days & Hours',  icon: Calendar,     sub: 'Schedule + holidays' },
  { href: '/dashboard/settings/leave-policies',  label: 'Leave Policies',        icon: Plane,        sub: 'Days by leave type × tier' },
  { href: '/dashboard/settings/departments',     label: 'Departments',           icon: Users,        sub: 'Org units + heads' },
  { href: '/dashboard/settings/payroll-config',  label: 'Payroll Configuration', icon: Calculator,   sub: 'EOBI, tax, OT, late rule' },
  { href: '/dashboard/settings/salary-structure', label: 'Salary Structure',      icon: Calculator,   sub: 'Basic % + component library' },
  { href: '/dashboard/settings/tax-slabs',       label: 'Income Tax Slabs',      icon: Calculator,   sub: 'FBR brackets by tax year' },
  { href: '/dashboard/settings/roles',           label: 'Roles',                 icon: ShieldCheck,  sub: 'Access matrix' },
  { href: '/dashboard/settings/daily-logging',   label: 'Daily Logging',         icon: ClipboardList,sub: 'KPI library + rules' },
] as const

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === '/dashboard/settings') return pathname === '/dashboard/settings'
    return pathname === href || pathname.startsWith(href + '/')
  }

  const activeLabel = SECTIONS.find((s) => isActive(s.href))?.label ?? 'Overview'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Configure how Convertt HR works for your organization.</p>
      </div>

      {/* Mobile dropdown */}
      <div className="lg:hidden">
        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Section</label>
        <select
          value={pathname}
          onChange={(e) => { window.location.href = e.target.value }}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
        >
          {SECTIONS.map((s) => (
            <option key={s.href} value={s.href}>{s.label}</option>
          ))}
        </select>
        <p className="mt-2 text-xs text-slate-500">Active: <span className="font-medium text-slate-700">{activeLabel}</span></p>
      </div>

      {/* The section list moved into the app sidebar (SETTINGS_NAV), so this
          renders only the active section — one view at a time, like Employee
          Lifecycle. The mobile dropdown above stays, since the app sidebar is
          collapsed on small screens. */}
      <div className="min-w-0">{children}</div>
    </div>
  )
}
