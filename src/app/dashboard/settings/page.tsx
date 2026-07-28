'use client'

/**
 * Settings — Overview landing.
 *
 * Each section is its own route (see layout.tsx for the sub-nav). This page
 * shows a grid of cards linking to each sub-section so HR can see "what
 * changes here" at a glance.
 *
 * Non-HR users are redirected to their personal /settings/account view.
 */
import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  Building2, Calendar, Calculator, Users, Plane,
  Mail, ShieldCheck, ClipboardList, ChevronRight,
} from 'lucide-react'

const CARDS = [
  { href: '/dashboard/settings/organization',    icon: Building2,   label: 'Organization',          sub: 'Company name, tax IDs, address.' },
  { href: '/dashboard/settings/working-days',    icon: Calendar,    label: 'Working Days & Hours',  sub: 'Schedule + holiday calendar.' },
  { href: '/dashboard/settings/leave-policies',  icon: Plane,       label: 'Leave Policies',        sub: 'Days by leave type × audience tier.' },
  { href: '/dashboard/settings/departments',     icon: Users,       label: 'Departments',           sub: 'Org units, heads, and members.' },
  { href: '/dashboard/settings/payroll-config',  icon: Calculator,  label: 'Payroll Configuration', sub: 'EOBI, tax slabs, OT multiplier, late rule.' },
  { href: '/dashboard/settings/email-templates', icon: Mail,        label: 'Email Templates',       sub: 'Subject + body library with variables.' },
  { href: '/dashboard/settings/roles',           icon: ShieldCheck, label: 'Roles',                 sub: 'Assign HR / Manager / Lead / Employee.' },
  { href: '/dashboard/settings/daily-logging',   icon: ClipboardList,label: 'Daily Logging',        sub: 'KPI library + submission rules.' },
] as const

export default function SettingsOverviewPage() {
  const router = useRouter()

  useEffect(() => {
    fetch('/api/auth/me').then((r) => r.json()).then((d) => {
      if (d.user && d.user.role !== 'HR_ADMIN') {
        router.replace('/dashboard/settings/account')
      }
    }).catch(() => {})
  }, [router])

  return (
    <Card>
      <CardHeader className="border-b border-slate-100">
        <CardTitle>Overview</CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <p className="text-sm text-slate-500 mb-5">
          Configure how Convertt HR works for your organization. Pick a section to jump in.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CARDS.map((c) => {
            const Icon = c.icon
            return (
              <Link
                key={c.href}
                href={c.href}
                className="block rounded-lg border border-slate-200 p-4 hover:bg-slate-50 hover:border-slate-300 transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-md bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-slate-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{c.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{c.sub}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 flex-shrink-0" />
                </div>
              </Link>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
