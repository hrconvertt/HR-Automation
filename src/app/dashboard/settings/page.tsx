'use client'

/**
 * Settings — Overview.
 *
 * This used to be eight cards linking to the eight sections already listed in
 * the sidebar beside it. Reading the same list twice tells you nothing the
 * second time, and it left the landing page with no answer to the only question
 * worth asking here: what is actually set right now.
 *
 * So it shows the current configuration. Each row links to the section that
 * owns it, which is a shortcut rather than a second menu.
 *
 * Non-HR users are redirected to their personal /settings/account view.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

interface DayHours { start: string; end: string; breakMins: number }

interface Snapshot {
  companyName?: string
  workingDays: string[]
  workDayHours: Record<string, DayHours>
  holidaysThisYear: number
  holidaysApplied: number
  departments?: number
}

export default function SettingsOverviewPage() {
  const router = useRouter()
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth/me').then((r) => r.json()).then((d) => {
      if (d.user && d.user.role !== 'HR_ADMIN') {
        router.replace('/dashboard/settings/account')
      }
    }).catch(() => {})
  }, [router])

  useEffect(() => {
    const year = new Date().getFullYear()
    Promise.all([
      fetch('/api/settings').then((r) => r.json()).catch(() => ({})),
      fetch(`/api/holidays?year=${year}`).then((r) => r.json()).catch(() => ({ holidays: [] })),
      fetch('/api/departments').then((r) => r.json()).catch(() => ({ departments: [] })),
    ]).then(([s, h, d]) => {
      const cfg = s?.config ?? {}
      // Config values are stored as JSON strings on some keys and objects on
      // others, depending on when they were written.
      function parse<T>(v: unknown, fallback: T): T {
        if (v == null) return fallback
        try { return typeof v === 'string' ? (JSON.parse(v) as T) : (v as T) } catch { return fallback }
      }
      const holidays: { applied?: boolean }[] = Array.isArray(h?.holidays) ? h.holidays : []
      const depts = Array.isArray(d?.departments) ? d.departments : null
      setSnap({
        companyName: cfg.companyName,
        workingDays: parse<string[]>(cfg.workingDays, []),
        workDayHours: parse<Record<string, DayHours>>(cfg.workDayHours, {}),
        holidaysThisYear: holidays.length,
        holidaysApplied: holidays.filter((x) => x.applied).length,
        departments: depts ? depts.length : undefined,
      })
      setLoading(false)
    })
  }, [])

  const days = snap?.workingDays ?? []
  const firstDay = days[0]
  const hours = firstDay ? snap?.workDayHours?.[firstDay] : undefined
  const year = new Date().getFullYear()

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="border-b border-slate-100">
          <CardTitle>How Convertt HR is configured</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : (
            <dl className="divide-y divide-slate-100">
              <Item
                label="Company"
                value={snap?.companyName || 'Not set'}
                href="/dashboard/settings/organization"
              />
              <Item
                label="Working week"
                value={days.length
                  ? `${days.length} days — ${days.map((d) => d.slice(0, 3)).join(', ')}`
                  : 'Not set'}
                detail={hours ? `${hours.start}–${hours.end}, ${hours.breakMins} min break` : undefined}
                href="/dashboard/settings/working-days"
              />
              <Item
                label={`Holidays ${year}`}
                value={snap?.holidaysThisYear
                  ? `${snap.holidaysThisYear} on the calendar`
                  : 'None on the calendar'}
                detail={snap?.holidaysThisYear
                  ? `${snap.holidaysApplied} applied to attendance`
                  : undefined}
                href="/dashboard/settings/working-days"
              />
              <Item
                label="Departments"
                value={snap?.departments != null ? String(snap.departments) : '—'}
                href="/dashboard/settings/departments"
              />
              <Item
                label="Leave policy"
                value="Casual and sick, allocated by audience tier"
                href="/dashboard/settings/leave-policies"
              />
              <Item
                label="Payroll"
                value="No tax or EOBI deducted"
                detail="Configure under Payroll → Configuration"
                href="/dashboard/payroll/configuration"
              />
            </dl>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-slate-400">
        Every section is in the sidebar. This page says what those settings currently hold.
      </p>
    </div>
  )
}

function Item({ label, value, detail, href }: {
  label: string; value: string; detail?: string; href: string
}) {
  return (
    <div className="flex items-baseline gap-4 py-3">
      <dt className="text-sm text-slate-500 w-44 shrink-0">{label}</dt>
      <dd className="flex-1 min-w-0">
        <p className="text-sm text-slate-900">{value}</p>
        {detail && <p className="text-xs text-slate-500 mt-0.5">{detail}</p>}
      </dd>
      <Link href={href} className="text-xs text-slate-500 hover:text-slate-900 hover:underline shrink-0">
        Change
      </Link>
    </div>
  )
}
