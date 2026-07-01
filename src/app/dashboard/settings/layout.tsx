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
  { href: '/dashboard/settings/email-templates', label: 'Email Templates',       icon: Mail,         sub: 'Subject + body library' },
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

      <div className="grid grid-cols-1 lg:grid-cols-[240px,1fr] gap-6">
        {/* Desktop rail */}
        <aside className="hidden lg:block space-y-1">
          {SECTIONS.map((s) => {
            const Icon = s.icon
            const active = isActive(s.href)
            return (
              <Link
                key={s.href}
                href={s.href}
                className={`block rounded-lg px-3 py-2.5 flex items-center gap-3 transition-colors ${
                  active
                    ? 'bg-slate-50 text-slate-900 ring-1 ring-slate-100'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${active ? 'bg-slate-100 text-slate-700' : 'bg-slate-100 text-slate-500'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{s.label}</p>
                  <p className="text-[11px] text-slate-500 truncate">{s.sub}</p>
                </div>
              </Link>
            )
          })}
        </aside>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}
