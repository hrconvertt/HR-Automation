import { prisma } from '@/lib/prisma'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatDate, getInitials } from '@/lib/utils'
import Link from 'next/link'
import { Users, Calendar, AlertCircle, CheckCircle2 } from 'lucide-react'

const AVATAR_PALETTE = [
  'bg-blue-100 text-blue-700', 'bg-emerald-100 text-emerald-700',
  'bg-purple-100 text-purple-700', 'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700', 'bg-sky-100 text-sky-700',
  'bg-indigo-100 text-indigo-700', 'bg-teal-100 text-teal-700',
]
function avatarTone(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
}

async function getData() {
  const today = new Date()
  const [checklists, probations] = await Promise.all([
    prisma.onboardingChecklist.findMany({
      orderBy: { createdAt: 'desc' },
      include: { employee: { select: { id: true, fullName: true, employeeCode: true, joiningDate: true, designation: true } } },
      take: 50,
    }),
    prisma.probationRecord.findMany({
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

function progressOf(c: Awaited<ReturnType<typeof getData>>['checklists'][0]) {
  const done = CHECKLIST_FIELDS.filter((f) => (c as Record<string, unknown>)[f.key as string]).length
  return { done, total: CHECKLIST_FIELDS.length, pct: Math.round((done / CHECKLIST_FIELDS.length) * 100) }
}

export default async function OnboardingPage() {
  const { checklists, probations, today } = await getData()

  function daysLeft(date: Date) {
    return Math.ceil((new Date(date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }

  // KPI counts
  const inProgress = checklists.filter((c) => progressOf(c).pct < 100).length
  const completedCount = checklists.filter((c) => progressOf(c).pct === 100).length
  const activeProbation = probations.filter((p) => !p.outcome).length
  const endingSoon = probations.filter((p) => {
    const dl = daysLeft(p.endDate); return !p.outcome && dl <= 14 && dl >= 0
  }).length

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Onboarding in Progress" value={inProgress}      Icon={Users}        tone="bg-blue-50 text-blue-600" />
        <Kpi label="Fully Onboarded"        value={completedCount}  Icon={CheckCircle2} tone="bg-emerald-50 text-emerald-600" />
        <Kpi label="Active Probation"       value={activeProbation} Icon={Calendar}     tone="bg-purple-50 text-purple-600" />
        <Kpi label="Probation Ending ≤14d"  value={endingSoon}      Icon={AlertCircle}  tone="bg-amber-50 text-amber-600" />
      </div>

      <Tabs defaultValue="checklists">
        <TabsList className="bg-white border border-slate-200 rounded-lg p-1 inline-flex">
          <TabsTrigger value="checklists">Active Onboarding</TabsTrigger>
          <TabsTrigger value="probation">Probation Tracker</TabsTrigger>
        </TabsList>

        {/* Active onboarding — card grid */}
        <TabsContent value="checklists" className="mt-4">
          <Card className="rounded-xl border-slate-200 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                <span className="font-semibold text-slate-900">{checklists.length}</span> employees · {inProgress} in progress · {completedCount} complete
              </p>
            </div>
            <div className="p-4 bg-slate-50/50">
              {checklists.length === 0 ? (
                <p className="text-center py-10 text-slate-400 text-sm">No onboarding records yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {checklists.map((c) => {
                    const { done, total, pct } = progressOf(c)
                    const isDone = pct === 100
                    return (
                      <Link
                        key={c.id}
                        href={`/dashboard/onboarding/${c.employee.id}`}
                        className="group bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md transition-all"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${avatarTone(c.employee.fullName)}`}>
                            {getInitials(c.employee.fullName)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-semibold text-slate-900 text-sm leading-tight truncate group-hover:text-blue-700">{c.employee.fullName}</p>
                              {isDone ? (
                                <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 flex-shrink-0">Complete</span>
                              ) : (
                                <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100 flex-shrink-0 tabular-nums">{pct}%</span>
                              )}
                            </div>
                            <p className="text-xs text-slate-600 mt-0.5 truncate">{c.employee.designation}</p>
                            <p className="text-[10px] text-slate-400 mt-1">Joined {formatDate(c.employee.joiningDate)}</p>
                            <div className="mt-2">
                              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${isDone ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
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
                          <Link href={`/dashboard/employees/${p.employee.id}`} className="font-medium text-slate-900 hover:text-blue-700">
                            {p.employee.fullName}
                          </Link>
                          <p className="text-xs text-slate-400">{p.employee.employeeCode}</p>
                        </TableCell>
                        <TableCell className="text-slate-600">{p.employee.designation}</TableCell>
                        <TableCell className="text-slate-500">{formatDate(p.startDate)}</TableCell>
                        <TableCell className="text-slate-500">{formatDate(p.endDate)}</TableCell>
                        <TableCell>
                          <span className={`text-sm tabular-nums ${isAlert ? 'text-amber-700 font-semibold' : dl < 0 && !p.outcome ? 'text-rose-700 font-semibold' : 'text-slate-700'}`}>
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
