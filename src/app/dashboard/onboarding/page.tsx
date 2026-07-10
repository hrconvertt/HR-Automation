import { prisma } from '@/lib/prisma'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatDate, getInitials } from '@/lib/utils'
import Link from 'next/link'
import { Users, Calendar, AlertCircle, CheckCircle2 } from 'lucide-react'

const AVATAR_PALETTE = [
  'bg-slate-100 text-slate-700', 'bg-slate-100 text-slate-700',
  'bg-slate-100 text-slate-700', 'bg-slate-100 text-slate-700',
  'bg-slate-100 text-slate-700', 'bg-slate-100 text-slate-700',
  'bg-slate-100 text-slate-700', 'bg-slate-100 text-slate-700',
]
function avatarTone(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
}

// Employees in any "exited" status should never appear on the
// onboarding board, even if a stale checklist row exists.
const EXCLUDED_EMP_STATUSES = ['RESIGNED', 'TERMINATED', 'INACTIVE', 'LAYOFF']

async function getData() {
  const today = new Date()
  const [checklists, probations] = await Promise.all([
    prisma.onboardingChecklist.findMany({
      where: { employee: { status: { notIn: EXCLUDED_EMP_STATUSES } } },
      orderBy: { createdAt: 'desc' },
      include: {
        employee: { select: { id: true, fullName: true, employeeCode: true, joiningDate: true, designation: true, department: { select: { name: true } } } },
        tasks: { select: { status: true, isComplete: true } },
      },
      take: 50,
    }),
    prisma.probationRecord.findMany({
      where: { employee: { status: { notIn: EXCLUDED_EMP_STATUSES } } },
      orderBy: { endDate: 'asc' },
      include: { employee: { select: { id: true, fullName: true, employeeCode: true, designation: true } } },
    }),
  ])
  return { checklists, probations, today }
}

const CHECKLIST_FIELDS: { key: keyof Awaited<ReturnType<typeof getData>>['checklists'][0]; label: string }[] = [
  { key: 'welcomeEmailSent',       label: 'Welcome email' },
  { key: 'firstDayCompleted',      label: 'First day done' },
  { key: 'offerLetterIssued',      label: 'Offer letter' },
  { key: 'agreementSigned',        label: 'Agreement signed' },
  { key: 'cnicCopied',             label: 'CNIC on file' },
  { key: 'bankDetailsCollected',   label: 'Bank details' },
  { key: 'educationDocsCopied',    label: 'Education docs' },
  { key: 'experienceLettersCopied',label: 'Experience letters' },
  { key: 'ndaSigned',              label: 'NDA signed' },
  { key: 'photoTaken',             label: 'Photo' },
  { key: 'systemAccessGranted',    label: 'System access' },
  { key: 'equipmentIssued',        label: 'Equipment issued' },
  { key: 'introductionDone',       label: 'Team intro' },
]

// Progress is task-based (same source of truth as the per-employee
// workspace). Falls back to the legacy boolean fields only for old
// checklists that never got seeded with tasks.
function progressOf(c: Awaited<ReturnType<typeof getData>>['checklists'][0]) {
  if (c.tasks.length > 0) {
    const done = c.tasks.filter((t) => t.status === 'COMPLETED' || t.status === 'NOT_REQUIRED' || t.isComplete).length
    return { done, total: c.tasks.length, pct: Math.round((done / c.tasks.length) * 100) }
  }
  const done = CHECKLIST_FIELDS.filter((f) => (c as unknown as Record<string, unknown>)[f.key as string]).length
  return { done, total: CHECKLIST_FIELDS.length, pct: Math.round((done / CHECKLIST_FIELDS.length) * 100) }
}

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter } = await searchParams
  const activeFilter = filter === 'in-progress' || filter === 'overdue' || filter === 'complete' ? filter : 'all'
  const { checklists, probations, today } = await getData()

  function daysLeft(date: Date) {
    return Math.ceil((new Date(date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }
  function daysSinceJoin(c: (typeof checklists)[0]) {
    return Math.floor((today.getTime() - new Date(c.employee.joiningDate).getTime()) / 86400000)
  }
  // Overdue = still incomplete 30+ days after joining (same 30-day window
  // that gates "Mark Fully Onboarded" in the workspace).
  function isOverdue(c: (typeof checklists)[0]) {
    return progressOf(c).pct < 100 && daysSinceJoin(c) > 30
  }

  // KPI counts
  const inProgress = checklists.filter((c) => progressOf(c).pct < 100).length
  const completedCount = checklists.filter((c) => progressOf(c).pct === 100).length
  const overdueCount = checklists.filter((c) => isOverdue(c)).length

  // Most-needs-attention first: overdue (oldest join first), then in-progress
  // (oldest join first), completed last.
  const sorted = [...checklists].sort((a, b) => {
    const rank = (c: typeof a) => (isOverdue(c) ? 0 : progressOf(c).pct < 100 ? 1 : 2)
    const r = rank(a) - rank(b)
    if (r !== 0) return r
    return rank(a) < 2
      ? daysSinceJoin(b) - daysSinceJoin(a)
      : daysSinceJoin(a) - daysSinceJoin(b)
  })
  const visible = sorted.filter((c) =>
    activeFilter === 'all' ? true :
    activeFilter === 'overdue' ? isOverdue(c) :
    activeFilter === 'complete' ? progressOf(c).pct === 100 :
    progressOf(c).pct < 100)
  const activeProbation = probations.filter((p) => !p.outcome).length
  const endingSoon = probations.filter((p) => {
    const dl = daysLeft(p.endDate); return !p.outcome && dl <= 14 && dl >= 0
  }).length

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Onboarding in Progress" value={inProgress}      Icon={Users}        tone="bg-slate-50 text-slate-700" />
        <Kpi label="Fully Onboarded"        value={completedCount}  Icon={CheckCircle2} tone="bg-slate-50 text-slate-700" />
        <Kpi label="Active Probation"       value={activeProbation} Icon={Calendar}     tone="bg-slate-50 text-slate-700" />
        <Kpi label="Probation Ending ≤14d"  value={endingSoon}      Icon={AlertCircle}  tone="bg-slate-50 text-slate-700" />
      </div>

      <Tabs defaultValue="checklists">
        <TabsList className="bg-white border border-slate-200 rounded-lg p-1 inline-flex">
          <TabsTrigger value="checklists">Active Onboarding</TabsTrigger>
          <TabsTrigger value="probation">Probation Tracker</TabsTrigger>
        </TabsList>

        {/* Active onboarding — card grid */}
        <TabsContent value="checklists" className="mt-4">
          <Card className="rounded-xl border-slate-200 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-slate-500">
                <span className="font-semibold text-slate-900">{checklists.length}</span> employees · {inProgress} in progress · {overdueCount} overdue · {completedCount} complete
              </p>
              <div className="flex gap-1">
                {([['all', 'All'], ['in-progress', 'In progress'], ['overdue', 'Overdue'], ['complete', 'Complete']] as const).map(([key, label]) => (
                  <Link
                    key={key}
                    href={key === 'all' ? '/dashboard/onboarding' : `/dashboard/onboarding?filter=${key}`}
                    className={`text-[11px] font-medium px-2 py-1 rounded-md border transition-colors ${
                      activeFilter === key
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="p-4 bg-slate-50/50">
              {visible.length === 0 ? (
                <p className="text-center py-10 text-slate-400 text-sm">
                  {checklists.length === 0 ? 'No onboarding records yet.' : 'No employees match this filter.'}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {visible.map((c) => {
                    const { done, total, pct } = progressOf(c)
                    const isDone = pct === 100
                    const days = daysSinceJoin(c)
                    const overdue = isOverdue(c)
                    return (
                      <Link
                        key={c.id}
                        href={`/dashboard/onboarding/${c.employee.id}`}
                        className="group bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-200 hover:shadow-md transition-all"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${avatarTone(c.employee.fullName)}`}>
                            {getInitials(c.employee.fullName)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-semibold text-slate-900 text-sm leading-tight truncate group-hover:text-slate-700">{c.employee.fullName}</p>
                              {isDone ? (
                                <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-50 text-slate-700 border border-slate-100 flex-shrink-0">Complete</span>
                              ) : overdue ? (
                                <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-800 text-white border border-slate-800 flex-shrink-0" title={`${total - done} task(s) still pending ${days} days after joining`}>Overdue</span>
                              ) : (
                                <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-50 text-slate-700 border border-slate-100 flex-shrink-0 tabular-nums">{pct}%</span>
                              )}
                            </div>
                            <p className="text-xs text-slate-600 mt-0.5 truncate">{c.employee.designation}{c.employee.department?.name ? ` · ${c.employee.department.name}` : ''}</p>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className="text-[10px] text-slate-400">Joined {formatDate(c.employee.joiningDate)}</span>
                              <span className={`text-[10px] px-1.5 py-px rounded-full border tabular-nums ${overdue ? 'bg-slate-100 text-slate-800 border-slate-300 font-semibold' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                                {days < 0 ? `starts in ${Math.abs(days)}d` : `${days}d in`}
                              </span>
                              {!isDone && (
                                <span className="text-[10px] px-1.5 py-px rounded-full border bg-slate-50 text-slate-600 border-slate-100 tabular-nums">
                                  {total - done} pending
                                </span>
                              )}
                            </div>
                            <div className="mt-2">
                              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${isDone ? 'bg-slate-700' : 'bg-slate-500'}`} style={{ width: `${pct}%` }} />
                              </div>
                              <p className="text-[10px] text-slate-500 mt-1 tabular-nums">{done} of {total} steps done</p>
                            </div>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* Probation tracker — table (no point in cards for time-series data) */}
        <TabsContent value="probation" className="mt-4">
          <Card className="rounded-xl border-slate-200 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                <span className="font-semibold text-slate-900">{probations.length}</span> probation records · {activeProbation} active · {endingSoon} ending within 14 days
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Days Left</TableHead>
                  <TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {probations.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-slate-400 text-sm">
                    No probation records yet.
                  </TableCell></TableRow>
                ) : (
                  probations.map((p) => {
                    const dl = daysLeft(p.endDate)
                    const isAlert = !p.outcome && dl <= 14 && dl >= 0
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <Link href={`/dashboard/employees/${p.employee.id}`} className="font-medium text-slate-900 hover:text-slate-700">
                            {p.employee.fullName}
                          </Link>
                          <p className="text-xs text-slate-400">{p.employee.employeeCode}</p>
                        </TableCell>
                        <TableCell className="text-slate-600">{p.employee.designation}</TableCell>
                        <TableCell className="text-slate-500">{formatDate(p.startDate)}</TableCell>
                        <TableCell className="text-slate-500">{formatDate(p.endDate)}</TableCell>
                        <TableCell>
                          <span className={`text-sm tabular-nums ${isAlert ? 'text-slate-700 font-semibold' : dl < 0 && !p.outcome ? 'text-slate-700 font-semibold' : 'text-slate-700'}`}>
                            {p.outcome ? '—' : dl < 0 ? `Overdue ${Math.abs(dl)}d` : `${dl} days`}
                          </span>
                        </TableCell>
                        <TableCell>
                          {p.outcome ? (
                            <Badge variant={p.outcome === 'CONFIRMED' ? 'success' : p.outcome === 'TERMINATED' ? 'destructive' : 'warning'}>
                              {p.outcome === 'CONFIRMED' ? 'Confirmed' : p.outcome === 'TERMINATED' ? 'Terminated' : 'Extended'}
                            </Badge>
                          ) : (
                            <Badge variant={isAlert ? 'warning' : 'secondary'}>In progress</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Kpi({ label, value, Icon, tone }: {
  label: string
  value: number
  Icon: React.ComponentType<{ className?: string }>
  tone: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{label}</p>
          <p className="text-lg font-bold text-slate-900 mt-1.5 tabular-nums">{value}</p>
        </div>
        <div className={`p-2 rounded-lg ${tone}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  )
}
