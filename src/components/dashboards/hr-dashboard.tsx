/**
 * HR Dashboard — action-oriented + visually polished.
 *
 *   Hero strip      — Good morning + 3 headline stats (active / pending / actions)
 *   Action Queue    — priority-sorted list of decisions waiting on HR
 *   Today + Week    — what's happening, no decision needed
 *   Operational     — slim status row
 */
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Card } from '@/components/ui/card'
import {
  ArrowRight, Inbox, Briefcase, GraduationCap, Calendar, Clock,
  AlertTriangle, ChevronRight, Cake, PartyPopper, CheckCircle2,
  FileText, Users, TrendingUp, Sparkles, ClipboardList,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { PoliciesPendingReview } from '@/components/dashboards/policies-pending-review'

function startOfToday(): Date {
  const d = new Date(); d.setHours(0,0,0,0); return d
}

// 2026 Pakistan public holidays (approximate — moon-sighted dates may shift)
const PK_HOLIDAYS_2026: { date: string; name: string }[] = [
  { date: '2026-02-05', name: 'Kashmir Day' },
  { date: '2026-03-20', name: 'Eid-ul-Fitr (est.)' },
  { date: '2026-03-21', name: 'Eid-ul-Fitr (est.)' },
  { date: '2026-03-23', name: 'Pakistan Day' },
  { date: '2026-05-01', name: 'Labour Day' },
  { date: '2026-05-27', name: 'Eid-ul-Adha (est.)' },
  { date: '2026-05-28', name: 'Eid-ul-Adha (est.)' },
  { date: '2026-08-14', name: 'Independence Day' },
  { date: '2026-09-15', name: 'Ashura (est.)' },
  { date: '2026-11-09', name: 'Iqbal Day' },
  { date: '2026-11-24', name: 'Eid Milad-un-Nabi (est.)' },
  { date: '2026-12-25', name: 'Quaid-e-Azam Day' },
]

async function loadData() {
  const today = startOfToday()
  const in7   = new Date(today); in7.setDate(in7.getDate() + 7)
  const in14  = new Date(today); in14.setDate(in14.getDate() + 14)
  const in30  = new Date(today); in30.setDate(in30.getDate() + 30)
  const last7 = new Date(today); last7.setDate(last7.getDate() - 7)
  const now = new Date()
  const month = now.getMonth() + 1
  const year  = now.getFullYear()

  const [
    pendingLeave, pendingOT, pendingHiringRequests, overdueProbation,
    onLeaveToday, joiningToday, upcomingProbationDecisions,
    pendingPayslipAdjustments, currentPayrollRun, openRoles,
    newApplicantsLast7, activeEmployeesForBirthday, activeEmployeesForAnniversary,
    activeCount, pendingPolicyAcks, talentPoolCount,
  ] = await Promise.all([
    prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
    prisma.attendanceLog.count({ where: { overtimeHours: { gt: 0 }, overtimeApproved: false } }),
    prisma.jobRequisition.count({ where: { status: 'PENDING' } }),
    prisma.probationRecord.count({ where: { outcome: null, endDate: { lt: today } } }),
    prisma.leaveRequest.findMany({
      where: { status: 'APPROVED', fromDate: { lte: today }, toDate: { gte: today } },
      include: { employee: { select: { fullName: true } } },
      take: 10,
    }),
    prisma.employee.findMany({
      where: { joiningDate: { gte: today, lt: new Date(today.getTime() + 86400_000) } },
      select: { fullName: true, designation: true },
    }),
    prisma.probationRecord.findMany({
      where: { outcome: null, endDate: { gte: today, lte: in14 } },
      include: { employee: { select: { fullName: true, employeeCode: true } } },
      orderBy: { endDate: 'asc' }, take: 5,
    }),
    prisma.payslip.count({ where: { isAdjusted: true, status: 'DRAFT' } }),
    prisma.payrollRun.findFirst({ where: { month, year }, select: { totalNet: true, status: true } }),
    prisma.jobRequisition.count({ where: { status: 'OPEN' } }),
    prisma.candidate.count({ where: { createdAt: { gte: last7 } } }),
    prisma.employee.findMany({ where: { status: 'ACTIVE', dob: { not: null } }, select: { fullName: true, dob: true } }),
    prisma.employee.findMany({ where: { status: 'ACTIVE' }, select: { fullName: true, joiningDate: true } }),
    prisma.employee.count({ where: { status: 'ACTIVE' } }),
    prisma.policyAcknowledgment.count({ where: { status: 'PENDING' } }),
    prisma.candidate.count({ where: { inTalentPool: true } }),
  ])

  const m = today.getMonth(); const d = today.getDate()
  const birthdaysToday = activeEmployeesForBirthday.filter((e) => e.dob && e.dob.getMonth() === m && e.dob.getDate() === d)
  const anniversariesToday = activeEmployeesForAnniversary.filter((e) =>
    e.joiningDate.getMonth() === m && e.joiningDate.getDate() === d && e.joiningDate.getFullYear() < year)

  // ── Build unified weekAhead feed for the next 7 days ──
  type WeekItem = {
    key: string; date: Date; type: 'joiner' | 'birthday' | 'anniversary' | 'probation' | 'holiday' | 'review';
    title: string; sub: string; tone: 'red' | 'amber' | 'blue' | 'emerald' | 'purple' | 'slate';
  }
  const weekItems: WeekItem[] = []

  // Joiners next 7 (excluding today which we count separately)
  const upcomingJoiners = await prisma.employee.findMany({
    where: { joiningDate: { gt: new Date(today.getTime() + 86400_000), lte: in7 } },
    select: { id: true, fullName: true, designation: true, joiningDate: true },
  })
  for (const e of upcomingJoiners) {
    weekItems.push({
      key: `joiner-${e.id}`, date: e.joiningDate, type: 'joiner',
      title: `${e.fullName} joins`, sub: e.designation || 'New hire', tone: 'emerald',
    })
  }

  // Probations ending — red <=14d, amber <=30d
  const endingProbations = await prisma.probationRecord.findMany({
    where: { outcome: null, endDate: { gte: today, lte: in30 } },
    include: { employee: { select: { id: true, fullName: true } } },
    orderBy: { endDate: 'asc' },
  })
  for (const p of endingProbations) {
    const days = Math.ceil((p.endDate.getTime() - today.getTime()) / 86400_000)
    weekItems.push({
      key: `prob-${p.id}`, date: p.endDate, type: 'probation',
      title: `${p.employee.fullName} probation ends`, sub: `${days}d remaining`,
      tone: days <= 14 ? 'red' : 'amber',
    })
  }

  // Birthdays in next 7
  for (const e of activeEmployeesForBirthday) {
    if (!e.dob) continue
    const bdThisYear = new Date(year, e.dob.getMonth(), e.dob.getDate())
    if (bdThisYear >= today && bdThisYear <= in7) {
      weekItems.push({
        key: `bday-${e.fullName}-${bdThisYear.toISOString()}`, date: bdThisYear, type: 'birthday',
        title: `${e.fullName}'s birthday`, sub: 'Send a note', tone: 'amber',
      })
    }
  }

  // Anniversaries in next 7
  for (const e of activeEmployeesForAnniversary) {
    const jm = e.joiningDate.getMonth(); const jd = e.joiningDate.getDate()
    const thisYearDate = new Date(year, jm, jd)
    if (thisYearDate >= today && thisYearDate <= in7 && e.joiningDate.getFullYear() < year) {
      const yrs = year - e.joiningDate.getFullYear()
      weekItems.push({
        key: `anniv-${e.fullName}-${yrs}`, date: thisYearDate, type: 'anniversary',
        title: `${e.fullName} — ${yrs}-year anniversary`, sub: 'Recognize the milestone', tone: 'purple',
      })
    }
  }

  // Performance review milestones — pending/self-submitted reviews
  // (no cycle endDate on the model so we approximate by recency)

  // PK public holidays in next 7
  for (const h of PK_HOLIDAYS_2026) {
    const dt = new Date(h.date + 'T00:00:00')
    if (dt >= today && dt <= in7) {
      weekItems.push({
        key: `hol-${h.date}`, date: dt, type: 'holiday', title: h.name, sub: 'Public holiday', tone: 'slate',
      })
    }
  }

  weekItems.sort((a, b) => a.date.getTime() - b.date.getTime())

  // ─── Lifecycle funnel + attrition (T6) ───
  const oneYearAgo = new Date(today); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const [onboardingActive, probationActive, exitInFlight, completedOnboard, hires12mo, exits12mo] = await Promise.all([
    prisma.onboardingChecklist.count({ where: { status: { not: 'COMPLETED' }, employee: { status: { notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE', 'LAYOFF'] } } } }),
    prisma.probationRecord.count({ where: { status: 'ACTIVE', employee: { status: { notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE', 'LAYOFF'] } } } }),
    prisma.exitClearance.count({ where: { status: 'IN_PROGRESS' } }),
    prisma.onboardingChecklist.findMany({
      where: { status: 'COMPLETED', completedAt: { gte: oneYearAgo, not: null }, employee: { status: { notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE', 'LAYOFF'] } } },
      include: { employee: { select: { joiningDate: true } } },
    }),
    prisma.employee.count({ where: { joiningDate: { gte: oneYearAgo } } }),
    prisma.employee.count({ where: { exitDate: { gte: oneYearAgo, not: null } } }),
  ])
  let avgDaysToOnboarded = 0
  if (completedOnboard.length > 0) {
    const total = completedOnboard.reduce((acc, c) => {
      const start = new Date(c.employee.joiningDate).getTime()
      const end = c.completedAt ? new Date(c.completedAt).getTime() : Date.now()
      return acc + (end - start) / 86400000
    }, 0)
    avgDaysToOnboarded = Math.round(total / completedOnboard.length)
  }
  const overallAttritionPct = activeCount > 0 ? Math.round((exits12mo / activeCount) * 100) : 0
  void hires12mo
  const lifecycleFunnel = {
    onboarding: onboardingActive,
    probation: probationActive,
    active: Math.max(0, activeCount - onboardingActive - probationActive),
    exit: exitInFlight,
    avgDaysToOnboarded,
    overallAttritionPct,
  }

  // ─── Possible Absconding (T10) — active employees with no attendance log
  //     in the past 9 days and no approved leave overlapping. ───
  const sevenDaysAgo = new Date(today); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 9)
  const activeEmps = await prisma.employee.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true, fullName: true, employeeCode: true,
      reportingManager: { select: { fullName: true } },
    },
  })
  const absconding: { id: string; name: string; code: string; manager: string | null; daysSince: number }[] = []
  for (const emp of activeEmps) {
    const latest = await prisma.attendanceLog.findFirst({
      where: { employeeId: emp.id, status: { notIn: ['WEEKEND', 'HOLIDAY', 'ABSENT'] } },
      orderBy: { date: 'desc' }, select: { date: true },
    })
    const lastDate = latest?.date ?? null
    if (lastDate && lastDate >= sevenDaysAgo) continue
    const leaves = await prisma.leaveRequest.count({
      where: { employeeId: emp.id, status: 'APPROVED', fromDate: { lte: today }, toDate: { gte: sevenDaysAgo } },
    })
    if (leaves >= 1) continue
    // Skip employees with no attendance ever (probably never onboarded into time tracking)
    if (!lastDate) continue
    const daysSince = Math.floor((today.getTime() - lastDate.getTime()) / 86400000)
    if (daysSince >= 9) {
      absconding.push({ id: emp.id, name: emp.fullName, code: emp.employeeCode, manager: emp.reportingManager?.fullName ?? null, daysSince })
    }
  }

  return {
    pendingLeave, pendingOT, pendingHiringRequests, overdueProbation,
    onLeaveToday, joiningToday, upcomingProbationDecisions, pendingPayslipAdjustments,
    currentPayrollRun, openRoles, newApplicantsLast7,
    birthdaysToday, anniversariesToday, weekItems, activeCount, pendingPolicyAcks, talentPoolCount,
    lifecycleFunnel, absconding,
  }
}


interface Props { userName: string }

export async function HRDashboard({ userName }: Props) {
  const d = await loadData()
  const totalActions =
    d.pendingLeave + d.pendingOT + d.pendingHiringRequests +
    d.overdueProbation + d.pendingPayslipAdjustments + d.pendingPolicyAcks
  const todayCount = d.onLeaveToday.length + d.joiningToday.length + d.birthdaysToday.length + d.anniversariesToday.length

  return (
    <div className="space-y-5">

      {/* Policy approvals where HR is also a reviewer */}
      <PoliciesPendingReview />

      {/* ─── HERO ────────────────────────────────────────────────────
          Layered card with a soft gradient. Greeting on the left,
          three headline stats on the right that the rest of the page
          drills into. */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-50 via-slate-50 to-slate-50 border border-slate-100 p-6 sm:p-8">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-slate-700 uppercase tracking-[0.18em]">
              {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight leading-tight mt-1">
              Good {timeOfDay()}, {userName.split(' ')[0]}
            </h1>
            <p className="text-sm text-slate-600 mt-2 max-w-md leading-relaxed">
              {totalActions > 0
                ? `${totalActions} ${totalActions === 1 ? 'item is' : 'items are'} waiting on your decision. Start with the action queue below — each row is one click away from being resolved.`
                : "You're at inbox zero. Everything that automation can handle, has been handled. Spend today on the work only you can do."}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 flex-shrink-0">
            <HeroStat label="Active" value={d.activeCount} tone="blue"
              tooltip="Active probations in progress" subLabel="employees" />
            <HeroStat label="Pending" value={totalActions} tone={totalActions > 0 ? 'amber' : 'green'}
              tooltip="Decisions waiting on you" subLabel="to action" />
            <HeroStat label="Today" value={todayCount} tone="purple"
              tooltip="Joiners, birthdays, or events today" subLabel="events" />
          </div>
        </div>
      </div>

      {/* ─── ACTION QUEUE ─────────────────────────────────────────── */}
      <Card className="rounded-2xl border-slate-200 overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-700 flex items-center justify-center">
              <Inbox className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Action Queue</p>
              <p className="text-[11px] text-slate-500">Decisions waiting on you</p>
            </div>
          </div>
          {totalActions > 0 && (
            <span className="text-xs font-semibold bg-slate-50 text-slate-700 border border-slate-100 rounded-full px-2.5 py-1">
              {totalActions} {totalActions === 1 ? 'item' : 'items'}
            </span>
          )}
        </div>
        {totalActions === 0 ? (
          <div className="px-4 py-10 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-50 text-slate-700 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-900">Inbox zero</p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              Nothing waiting on your decision. The auto-pilot is doing its job.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            <ActionRow show={d.overdueProbation > 0} priority="high"
              icon={<AlertTriangle className="w-4 h-4" />} tone="rose" count={d.overdueProbation}
              label={d.overdueProbation === 1 ? 'probation past end-date' : 'probations past end-date'}
              sub="Confirm, extend, or terminate each one"
              href="/dashboard/onboarding?tab=probation" />
            <ActionRow show={d.pendingHiringRequests > 0} priority="high"
              icon={<Briefcase className="w-4 h-4" />} tone="purple" count={d.pendingHiringRequests}
              label={d.pendingHiringRequests === 1 ? 'hiring request from a manager' : 'hiring requests from managers'}
              sub="Review the rationale and approve / reject"
              href="/dashboard/recruiting?tab=requests" />
            <ActionRow show={d.pendingLeave > 0} priority="medium"
              icon={<Calendar className="w-4 h-4" />} tone="amber" count={d.pendingLeave}
              label={d.pendingLeave === 1 ? 'leave request pending' : 'leave requests pending'}
              sub="One-click approve/decline per row"
              href="/dashboard/leave" />
            <ActionRow show={d.pendingOT > 0} priority="medium"
              icon={<Clock className="w-4 h-4" />} tone="blue" count={d.pendingOT}
              label={d.pendingOT === 1 ? 'overtime entry to approve' : 'overtime entries to approve'}
              sub="Affects this month's payroll if not approved soon"
              href="/dashboard/time" />
            <ActionRow show={d.pendingPayslipAdjustments > 0} priority="medium"
              icon={<FileText className="w-4 h-4" />} tone="emerald" count={d.pendingPayslipAdjustments}
              label={d.pendingPayslipAdjustments === 1 ? 'adjusted payslip' : 'adjusted payslips'}
              sub="Approve to include in the next payroll run"
              href="/dashboard/payroll" />
            <ActionRow show={d.pendingPolicyAcks > 0} priority="low"
              icon={<ClipboardList className="w-4 h-4" />} tone="slate" count={d.pendingPolicyAcks}
              label={d.pendingPolicyAcks === 1 ? 'policy acknowledgment outstanding' : 'policy acknowledgments outstanding'}
              sub="Nudge employees who haven't signed required policies"
              href="/dashboard/policies" />
          </ul>
        )}
      </Card>

      {/* ─── TODAY + WEEK ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="rounded-2xl border-slate-200 overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-700 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Today&apos;s Pulse</p>
              <p className="text-[11px] text-slate-500">Awareness, no action needed</p>
            </div>
          </div>
          <div className="p-4 space-y-1">
            <PulseRow icon={<Calendar className="w-4 h-4 text-slate-700" />} tone="blue"
              label="On leave" value={d.onLeaveToday.length}
              names={d.onLeaveToday.map((l) => l.employee.fullName)}
              emptyText="Everyone in today" />
            <PulseRow icon={<PartyPopper className="w-4 h-4 text-slate-700" />} tone="emerald"
              label="Joining today" value={d.joiningToday.length}
              names={d.joiningToday.map((e) => e.fullName)}
              emptyText="No new hires today" />
            <PulseRow icon={<Cake className="w-4 h-4 text-slate-700" />} tone="amber"
              label="Birthdays" value={d.birthdaysToday.length}
              names={d.birthdaysToday.map((e) => e.fullName)}
              emptyText="No birthdays today" />
            <PulseRow icon={<PartyPopper className="w-4 h-4 text-slate-700" />} tone="purple"
              label="Work anniversaries" value={d.anniversariesToday.length}
              names={d.anniversariesToday.map((e) => e.fullName)}
              emptyText="No anniversaries today" />
          </div>
        </Card>

        <Card className="rounded-2xl border-slate-200 overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-700 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">This Week Ahead</p>
              <p className="text-[11px] text-slate-500">Heads-up so nothing surprises you</p>
            </div>
          </div>
          <div className="p-4 space-y-1">
            {d.weekItems.length === 0 ? (
              <div className="text-center py-6">
                <div className="w-10 h-10 rounded-full bg-slate-50 text-slate-300 flex items-center justify-center mx-auto mb-2">
                  <Calendar className="w-5 h-5" />
                </div>
                <p className="text-xs text-slate-500">Nothing scheduled this week.</p>
              </div>
            ) : (
              d.weekItems.map((it) => <WeekItemRow key={it.key} item={it} />)
            )}
          </div>
        </Card>
      </div>

      {/* ─── LIFECYCLE FUNNEL ───────────────────────────────────── */}
      <Card className="rounded-2xl border-slate-200 overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-700 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Lifecycle Funnel</p>
              <p className="text-[11px] text-slate-500">Where everyone is in their journey</p>
            </div>
          </div>
          <Link href="/dashboard/lifecycle" className="text-xs text-slate-700 hover:underline">Open lifecycle →</Link>
        </div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-6 gap-3 text-center">
          <FunnelTile label="Onboarding" value={d.lifecycleFunnel.onboarding} tone="blue" />
          <FunnelTile label="Probation" value={d.lifecycleFunnel.probation} tone="amber" />
          <FunnelTile label="Active" value={d.lifecycleFunnel.active} tone="emerald" />
          <FunnelTile label="Exit" value={d.lifecycleFunnel.exit} tone="rose" />
          <FunnelTile label="Avg days to onboarded" value={d.lifecycleFunnel.avgDaysToOnboarded} tone="slate" />
          <FunnelTile label="Attrition (12mo)" value={`${d.lifecycleFunnel.overallAttritionPct}%`} tone="slate" />
        </div>
      </Card>

      {/* ─── ABSCONDING ──────────────────────────────────────────── */}
      {d.absconding.length > 0 && (
        <Card className="rounded-2xl border-slate-100 bg-slate-50/40 overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Possible Absconding</p>
                <p className="text-[11px] text-slate-700">No attendance in 9+ days, no covering leave</p>
              </div>
            </div>
            <span className="text-xs font-semibold bg-white text-slate-700 border border-slate-100 rounded-full px-2.5 py-1">
              {d.absconding.length}
            </span>
          </div>
          <ul className="divide-y divide-slate-100">
            {d.absconding.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <Link href={`/dashboard/employees/${a.id}`} className="text-sm font-medium text-slate-900 hover:underline">{a.name}</Link>
                  <p className="text-[11px] text-slate-500">{a.code} · {a.daysSince}d since last log{a.manager ? ` · Manager: ${a.manager}` : ''}</p>
                </div>
                <form action={`/api/employees/${a.id}/mark-absconded`} method="post">
                  <button className="text-xs font-medium text-slate-700 border border-slate-200 rounded-full bg-white px-3 py-1 hover:bg-slate-100">
                    Mark as ABSCONDED
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ─── OPERATIONAL ─────────────────────────────────────────── */}
      <div>
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.16em] mb-3">Operational Status</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <OpsTile
            Icon={TrendingUp}
            label={`${monthLabel()} Payroll`}
            value={d.currentPayrollRun ? formatCurrency(d.currentPayrollRun.totalNet) : 'Not prepared'}
            sub={d.currentPayrollRun ? (d.currentPayrollRun.status === 'DRAFT' ? 'Draft · review & approve' : 'Finalized') : 'Run when ready'}
            tone={d.currentPayrollRun?.status === 'DRAFT' ? 'amber' : d.currentPayrollRun ? 'green' : 'slate'}
            href="/dashboard/payroll" />
          <OpsTile
            Icon={Briefcase}
            label="Open Roles"
            value={String(d.openRoles)}
            sub={d.openRoles > 0 ? 'actively hiring' : 'nothing posted'}
            tone={d.openRoles > 0 ? 'blue' : 'slate'}
            href="/dashboard/recruiting" />
          <OpsTile
            Icon={Sparkles}
            label="New Applicants · 7d"
            value={String(d.newApplicantsLast7)}
            sub={d.newApplicantsLast7 > 0 ? 'review the pipeline' : 'no new applications'}
            tone={d.newApplicantsLast7 > 0 ? 'emerald' : 'slate'}
            href="/dashboard/recruiting?tab=pipeline&stage=SCREENING" />
          <OpsTile
            Icon={Users}
            label="Talent Pool"
            value={String(d.talentPoolCount)}
            sub={d.talentPoolCount > 0 ? 'pre-vetted, ready when needed' : 'starts filling automatically'}
            tone={d.talentPoolCount > 0 ? 'purple' : 'slate'}
            href="/dashboard/recruiting?tab=pool" />
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────

function HeroStat({ label, value, tone, tooltip, subLabel }: {
  label: string; value: number; tone: 'blue' | 'amber' | 'green' | 'purple';
  tooltip?: string; subLabel?: string;
}) {
  const TONE: Record<string, string> = {
    blue:   'bg-white/70 text-slate-700 ring-slate-100',
    amber:  'bg-slate-50 text-slate-900 ring-slate-100',
    green:  'bg-slate-50 text-slate-700 ring-slate-100',
    purple: 'bg-white/70 text-slate-700 ring-slate-100',
  }
  return (
    <div title={tooltip} className={`rounded-xl ring-1 ${TONE[tone]} backdrop-blur-sm px-4 py-3 text-center min-w-[88px] cursor-help`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-2xl font-bold tabular-nums mt-0.5">{value}</p>
      {subLabel && <p className="text-[9px] opacity-60 mt-0.5">{subLabel}</p>}
    </div>
  )
}

function ActionRow({ show, priority, icon, tone, count, label, sub, href }: {
  show: boolean; priority: 'high' | 'medium' | 'low'
  icon: React.ReactNode; tone: 'amber' | 'blue' | 'purple' | 'rose' | 'emerald' | 'slate'
  count: number; label: string; sub: string; href: string
}) {
  if (!show) return null
  const ICON_BG: Record<string, string> = {
    amber:   'bg-slate-50 text-slate-700',
    blue:    'bg-slate-50 text-slate-700',
    purple:  'bg-slate-50 text-slate-700',
    rose:    'bg-slate-50 text-slate-700',
    emerald: 'bg-slate-50 text-slate-700',
    slate:   'bg-slate-100 text-slate-600',
  }
  return (
    <li>
      <Link href={href} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition group">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${ICON_BG[tone]}`}>{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold text-slate-900 tabular-nums">{count}</span>
            <span className="text-sm text-slate-700 truncate">{label}</span>
            {priority === 'high' && (
              <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-700 bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5 flex-shrink-0">Urgent</span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate">{sub}</p>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-700 group-hover:translate-x-0.5 transition flex-shrink-0" />
      </Link>
    </li>
  )
}

function PulseRow({ icon, label, value, names, emptyText }: {
  icon: React.ReactNode; tone: string;
  label: string; value: number; names: string[]; emptyText: string
}) {
  const empty = value === 0
  return (
    <div className="flex items-center justify-between gap-3 py-2 px-2.5 -mx-2 rounded-lg hover:bg-slate-50/60 transition">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`flex-shrink-0 ${empty ? 'opacity-40' : ''}`}>{icon}</span>
        <span className={`text-sm font-medium ${empty ? 'text-slate-400' : 'text-slate-700'}`}>{label}</span>
      </div>
      <div className="flex items-baseline gap-2 min-w-0 text-right">
        <span className={`text-base font-bold tabular-nums flex-shrink-0 ${empty ? 'text-slate-300' : 'text-slate-900'}`}>{value}</span>
        <span className="text-[11px] text-slate-500 truncate max-w-[160px]">
          {empty ? emptyText : (names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : ''))}
        </span>
      </div>
    </div>
  )
}

function OpsTile({ Icon, label, value, sub, tone, href }: {
  Icon: React.ComponentType<{ className?: string }>
  label: string; value: string; sub: string;
  tone: 'green' | 'amber' | 'blue' | 'slate' | 'purple' | 'emerald'; href: string
}) {
  const ICON_BG: Record<string, string> = {
    green:   'bg-slate-50 text-slate-700',
    emerald: 'bg-slate-50 text-slate-700',
    amber:   'bg-slate-50 text-slate-700',
    blue:    'bg-slate-50 text-slate-700',
    purple:  'bg-slate-50 text-slate-700',
    slate:   'bg-slate-100 text-slate-500',
  }
  return (
    <Link href={href}
      className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5 transition-all block group">
      <div className="flex items-start justify-between mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${ICON_BG[tone]}`}>
          <Icon className="w-4 h-4" />
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-600 group-hover:translate-x-0.5 transition" />
      </div>
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-bold mt-0.5 text-slate-900 tabular-nums">{value}</p>
      <p className="text-[11px] text-slate-500 mt-1">{sub}</p>
    </Link>
  )
}

function WeekItemRow({ item }: { item: {
  date: Date;
  type: 'joiner' | 'birthday' | 'anniversary' | 'probation' | 'holiday' | 'review';
  title: string; sub: string;
  tone: 'red' | 'amber' | 'blue' | 'emerald' | 'purple' | 'slate';
} }) {
  const TONE: Record<string, string> = {
    red:     'bg-slate-50 text-slate-700',
    amber:   'bg-slate-50 text-slate-700',
    blue:    'bg-slate-50 text-slate-700',
    emerald: 'bg-slate-50 text-slate-700',
    purple:  'bg-slate-50 text-slate-700',
    slate:   'bg-slate-100 text-slate-500',
  }
  const ICONS: Record<string, React.ReactNode> = {
    joiner:      <PartyPopper className="w-4 h-4" />,
    birthday:    <Cake className="w-4 h-4" />,
    anniversary: <PartyPopper className="w-4 h-4" />,
    probation:   <GraduationCap className="w-4 h-4" />,
    holiday:     <Calendar className="w-4 h-4" />,
    review:      <ClipboardList className="w-4 h-4" />,
  }
  return (
    <div className="flex items-center gap-3 py-2 px-2.5 -mx-2 rounded-lg hover:bg-slate-50/60 transition">
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${TONE[item.tone]}`}>
        {ICONS[item.type]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900 truncate">{item.title}</p>
        <p className="text-[11px] text-slate-500 truncate">
          {item.sub} · {item.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
        </p>
      </div>
    </div>
  )
}

function FunnelTile({ label, value, tone }: { label: string; value: number | string; tone: 'blue' | 'amber' | 'emerald' | 'rose' | 'slate' }) {
  const TONE: Record<string, string> = {
    blue: 'bg-slate-50 text-slate-700 border-slate-100',
    amber: 'bg-slate-50 text-slate-900 border-slate-100',
    emerald: 'bg-slate-50 text-slate-700 border-slate-100',
    rose: 'bg-slate-50 text-slate-700 border-slate-100',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
  }
  return (
    <div className={`rounded-xl border ${TONE[tone]} px-3 py-3`}>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-[10px] uppercase tracking-wide opacity-70 mt-0.5">{label}</p>
    </div>
  )
}

function timeOfDay(): string {
  const h = new Date().getHours()
  if (h < 5)  return 'evening'
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
function monthLabel(): string {
  return new Date().toLocaleDateString('en-GB', { month: 'long' })
}
