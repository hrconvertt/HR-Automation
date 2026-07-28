'use client'

/**
 * /dashboard/settings/account
 *
 * Personal account landing — overview of who you're signed in as,
 * with deep-links into each section (password, profile, notifications,
 * preferences). Available to every role.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import SettingsSidebar from '@/components/settings-sidebar'
import { Lock, User as UserIcon, Bell, Settings2, ChevronRight, ShieldAlert } from 'lucide-react'

interface MeUser {
  id: string
  email: string
  role: string
  roles?: string[]
  mustChangePass?: boolean
  employee?: {
    id: string
    fullName: string
    designation?: string
    photoUrl?: string | null
    department?: { name: string } | null
  } | null
}

export default function AccountPage() {
  const [user, setUser] = useState<MeUser | null>(null)
  useEffect(() => {
    fetch('/api/auth/me').then((r) => r.json()).then((d) => setUser(d.user)).catch(() => {})
  }, [])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Manage your account, profile, and how Convertt HR notifies you.</p>
      </div>

      {user?.mustChangePass && (
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-slate-700 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">Please set a new password before continuing</p>
            <p className="text-xs text-slate-900 mt-0.5">You are using a temporary password. For security, choose your own.</p>
          </div>
          <Link href="/dashboard/settings/password" className="text-sm font-semibold text-slate-900 hover:underline">
            Change now →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-6">
        <SettingsSidebar role={user?.role} />

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader className="border-b border-slate-100"><CardTitle>Account overview</CardTitle></CardHeader>
            <CardContent className="p-6 space-y-3">
              <Row label="Display name" value={user?.employee?.fullName ?? '—'} />
              <Row label="Email" value={user?.email ?? '—'} />
              <Row label="Designation" value={user?.employee?.designation ?? '—'} />
              <Row label="Department" value={user?.employee?.department?.name ?? '—'} />
              <Row label="Primary role" value={<Badge>{user?.role ?? '—'}</Badge>} />
              {user?.roles && user.roles.length > 1 && (
                <Row label="All roles" value={
                  <div className="flex flex-wrap gap-1">
                    {user.roles.map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}
                  </div>
                } />
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <QuickLink href="/dashboard/settings/password" icon={Lock} title="Change password" sub="Update your sign-in password" />
            <QuickLink href="/dashboard/settings/profile" icon={UserIcon} title="Edit profile" sub="Display name + photo + pronouns" />
            <QuickLink href="/dashboard/settings/notifications" icon={Bell} title="Notifications" sub="Per-category email + in-app toggles" />
            <QuickLink href="/dashboard/settings/preferences" icon={Settings2} title="Preferences" sub="Theme + language + privacy" />
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-xs uppercase tracking-wider text-slate-500 font-medium">{label}</span>
      <span className="text-sm text-slate-900 text-right">{value}</span>
    </div>
  )
}

function QuickLink({ href, icon: Icon, title, sub }: { href: string; icon: React.ComponentType<{ className?: string }>; title: string; sub: string }) {
  return (
    <Link href={href} className="rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-200 hover:shadow-sm transition group flex items-start gap-3">
      <div className="w-10 h-10 rounded-lg bg-slate-50 text-slate-700 flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-700 flex-shrink-0 mt-1" />
    </Link>
  )
}
