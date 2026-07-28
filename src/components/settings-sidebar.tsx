'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  User as UserIcon, Lock, Bell, Settings2, ChevronRight,
  Building2, ShieldCheck,
} from 'lucide-react'

/**
 * Settings left-nav, shared across the personal /dashboard/settings/* pages
 * AND the HR-only /dashboard/settings page (organization-level config).
 *
 * The links surface for every role; HR-only items render only when
 * `role==='HR_ADMIN'`. Each role sees the same personal account UI scoped
 * to themselves — there is no separate per-role settings tree.
 */
interface Props {
  role?: string
}

const PERSONAL = [
  { href: '/dashboard/settings/account',       label: 'Account',       icon: UserIcon,  sub: 'Email, role, account overview' },
  { href: '/dashboard/settings/password',      label: 'Password',      icon: Lock,      sub: 'Change password + sessions' },
  { href: '/dashboard/settings/profile',       label: 'Profile',       icon: UserIcon,  sub: 'Display name + photo' },
  { href: '/dashboard/settings/notifications', label: 'Notifications', icon: Bell,      sub: 'Per-category toggles' },
  { href: '/dashboard/settings/preferences',   label: 'Preferences',   icon: Settings2, sub: 'Theme + language + privacy' },
] as const

const HR_ONLY = [
  { href: '/dashboard/settings',                label: 'Organization', icon: Building2,   sub: 'Company name, departments, leave' },
  { href: '/dashboard/settings/email-templates',label: 'Email Templates', icon: ShieldCheck, sub: 'Subject + body templates' },
] as const

export default function SettingsSidebar({ role }: Props) {
  const pathname = usePathname()
  const showHr = role === 'HR_ADMIN'
  return (
    <aside className="space-y-1">
      <p className="px-3 mb-2 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
        My Account
      </p>
      {PERSONAL.map((item) => <Row key={item.href} item={item} active={pathname === item.href} />)}
      {showHr && (
        <>
          <p className="px-3 mt-5 mb-2 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
            Organization
          </p>
          {HR_ONLY.map((item) => <Row key={item.href} item={item} active={pathname === item.href} />)}
        </>
      )}
    </aside>
  )
}

function Row({ item, active }: { item: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; sub: string }; active: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      className={`
        w-full text-left rounded-lg px-3 py-2.5 flex items-center gap-3 transition-colors
        ${active ? 'bg-slate-50 text-slate-900 ring-1 ring-slate-100' : 'text-slate-700 hover:bg-slate-100'}
      `}
    >
      <div className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${active ? 'bg-slate-100 text-slate-700' : 'bg-slate-100 text-slate-500'}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{item.label}</p>
        <p className="text-[11px] text-slate-500 truncate">{item.sub}</p>
      </div>
      <ChevronRight className={`w-4 h-4 flex-shrink-0 ${active ? 'text-slate-700' : 'text-slate-300'}`} />
    </Link>
  )
}
