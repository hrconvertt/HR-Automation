import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  CalendarDays,
  Clock,
  Banknote,
  FileText,
  ArrowUpRight,
  CheckCircle2,
  LifeBuoy,
  UserCog,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { TimeClockCard } from '@/components/time-clock-card'
import { SeedLeaveBalancesButton } from '@/components/seed-leave-balances-button'

async function getEmployeeData(employeeId: string) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const currentYear = now.getFullYear()

  const [
    employee,
    todayAttendance,
    yesterdayAttendance,
    leaveBalances,
    latestPayslip,
    pendingPolicies,
    pendingLeaves,
    announcements,
    pendingOnboardingTasks,
    pendingSelfReviews,
    existingDocs,
  ] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        fullName: true,
        designation: true,
        department: { select: { name: true } },
      },
    }),
    prisma.attendanceLog.findFirst({
      where: { employeeId, date: { gte: today, lt: tomorrow } },
      select: { clockIn: true, clockOut: true, workType: true, hoursWorked: true, status: true },
    }),
    prisma.attendanceLog.findFirst({
      where: { employeeId, date: { gte: yesterday, lt: today } },
      select: { id: true, clockIn: true, status: true },
    }),
    prisma.leaveBalance.findMany({
      where: { employeeId, year: currentYear },
      orderBy: { leaveType: 'asc' },
    }),
    prisma.payslip.findFirst({
      where: { employeeId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      select: { id: true, month: true, year: true, netSalary: true, status: true },
    }),
    prisma.policyAcknowledgment.findMany({
      where: { employeeId, status: 'PENDING' },
      include: { policy: { select: { title: true } } },
      take: 6,
    }),
    prisma.leaveRequest.findMany({
      where: { employeeId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 6,
    }),
    prisma.announcement.findMany({
      where: { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      take: 3,
    }),
    // Onboarding tasks the employee themselves must complete (e.g. upload
    // CNIC / Photo / Education / Experience). OnboardingTask.owner === 'EMPLOYEE'
    // OR isEmployeeUploadable is true and not yet complete.
    prisma.onboardingTask.findMany({
      where: {
        checklist: { employeeId },
        isComplete: false,
        OR: [{ owner: 'EMPLOYEE' }, { isEmployeeUploadable: true }],
      },
      select: { id: true, title: true, documentType: true, isEmployeeUploadable: true },
      orderBy: { orderIndex: 'asc' },
      take: 8,
    }),
    // Self-assessment forms due — review is open and the employee hasn't
    // submitted their self section yet.
    prisma.performanceReview.findMany({
      where: { employeeId, status: 'PENDING' },
      select: { id: true, reviewPeriod: true, reviewType: true },
      orderBy: { createdAt: 'desc' },
      take: 4,
    }),
    // Existing documents — used to flag missing required uploads independently
    // of any OnboardingTask row (early hires without a checklist still need
    // to be reminded to upload their CNIC etc.).
    prisma.employeeDocument.findMany({
      where: { employeeId, type: { in: ['CNIC', 'PHOTO', 'EDUCATIONAL_CERTIFICATE', 'EXPERIENCE'] } },
      select: { type: true },
    }),
  ])

  // My probation — show only while still in-progress
  const myProbation = await prisma.probationRecord.findFirst({
    where: { employeeId, status: { in: ['ACTIVE', 'UNDER_REVIEW'] } },
    orderBy: { startDate: 'desc' },
    select: {
      id: true, startDate: true, endDate: true, status: true,
      settlingCheckInAt: true, settlingFlag: true,
      managerSubmittedAt: true, hrDecidedAt: true, outcomeEnactedAt: true,
    },
  })

  return {
    employee,
    todayAttendance,
    yesterdayAttendance,
    leaveBalances,
    latestPayslip,
    pendingPolicies,
    pendingLeaves,
    announcements,
    myProbation,
    pendingOnboardingTasks,
    pendingSelfReviews,
    existingDocs,
    yesterday,
  }
}

function formatTime(d: Date | null | undefined) {
  if (!d) return ''
  return new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

const monthName = (m: number) =>
  new Date(2000, m - 1, 1).toLocaleDateString('en-GB', { month: 'long' })

export async function EmployeeDashboard({
  employeeId,
  userName,
  viewerRole,
}: {
  employeeId: string
  userName: string
  viewerRole?: string
}) {
  const data = await getEmployeeData(employeeId)
  const firstName = userName.split(' ')[0]
  const emp = data.employee

  const att = data.todayAttendance
  const isClockedIn = !!att?.clockIn && !att?.clockOut

  // Task list — aggregates anything that needs the employee's action across
  // onboarding, performance, policy acks, documents, leave, and timesheets.
  // We don't have a generic Task table; everything is computed live from the
  // canonical source models.
  type TaskIcon = 'policy' | 'leave' | 'onboarding' | 'review' | 'document' | 'timesheet'
  type Task = { key: string; icon: TaskIcon; label: string; href: string; action: string }
  const tasks: Task[] = []

  // 1. Pending onboarding checklist items (employee-owned or upload tasks)
  for (const t of data.pendingOnboardingTasks) {
    tasks.push({
      key: `onb-${t.id}`,
      icon: 'onboarding',
      label: t.title,
      href: emp ? `/dashboard/employees/${emp.id}` : '/dashboard',
      action: t.isEmployeeUploadable ? 'Upload' : 'Complete',
    })
  }

  // 2. Self-assessment reviews due
  for (const r of data.pendingSelfReviews) {
    tasks.push({
      key: `rev-${r.id}`,
      icon: 'review',
      label: `Self-assessment: ${r.reviewType} — ${r.reviewPeriod}`,
      href: '/dashboard/performance',
      action: 'Start',
    })
  }

  // 3. Policy acknowledgments
  for (const p of data.pendingPolicies) {
    tasks.push({
      key: `pol-${p.id}`,
      icon: 'policy',
      label: `Sign policy: ${p.policy.title}`,
      href: '/dashboard/documents',
      action: 'Sign now',
    })
  }

  // 4. Missing required documents (independent of any OnboardingTask row).
  const haveDocTypes = new Set(data.existingDocs.map((d) => d.type))
  const requiredDocs: { type: string; label: string }[] = [
    { type: 'CNIC',                   label: 'Upload CNIC copy' },
    { type: 'PHOTO',                  label: 'Upload passport-size photo' },
    { type: 'EDUCATIONAL_CERTIFICATE',label: 'Upload education certificate' },
    { type: 'EXPERIENCE',             label: 'Upload experience letter (if any)' },
  ]
  for (const d of requiredDocs) {
    if (!haveDocTypes.has(d.type)) {
      // Skip Experience for employees who don't have one — surface only as a
      // soft reminder when nothing else is pending.
      if (d.type === 'EXPERIENCE' && tasks.length > 0) continue
      tasks.push({
        key: `doc-${d.type}`,
        icon: 'document',
        label: d.label,
        href: emp ? `/dashboard/employees/${emp.id}` : '/dashboard',
        action: 'Upload',
      })
    }
  }

  // 5. Pending leave requests (so the employee can see them in-flight).
  for (const l of data.pendingLeaves) {
    tasks.push({
      key: `lr-${l.id}`,
      icon: 'leave',
      label: `${l.leaveType} · ${formatDate(l.fromDate)} – ${formatDate(l.toDate)}`,
      href: '/dashboard/leave',
      action: 'Pending review',
    })
  }

  // 6. Missing timesheet entry — yesterday wasn't a weekend AND no AttendanceLog.
  const yDay = data.yesterday.getDay() // 0 Sun, 6 Sat
  if (yDay !== 0 && yDay !== 6 && !data.yesterdayAttendance) {
    tasks.push({
      key: `ts-${data.yesterday.toISOString().split('T')[0]}`,
      icon: 'timesheet',
      label: `No clock-in recorded for ${formatDate(data.yesterday)}`,
      href: '/dashboard/time',
      action: 'Log time',
    })
  }

  const limitedTasks = tasks.slice(0, 8)

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-50 to-slate-50 border border-slate-100 p-8">
        <h1 className="text-3xl font-bold text-gray-900">Welcome, {firstName}!</h1>
        <p className="text-sm text-gray-600 mt-2">
          {emp?.designation}
          {emp?.department?.name ? ` · ${emp.department.name}` : ''}
        </p>
      </div>

      {/* My Probation — only while in-progress */}
      {data.myProbation && (() => {
        const p = data.myProbation
        const total = Math.max(1, Math.ceil((p.endDate.getTime() - p.startDate.getTime()) / 86400_000))
        const remaining = Math.ceil((p.endDate.getTime() - Date.now()) / 86400_000)
        const elapsed = total - remaining
        const pct = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)))
        const toneText = remaining < 0 ? 'text-slate-700' : remaining <= 14 ? 'text-slate-700' : 'text-slate-700'
        const toneBg   = remaining < 0 ? 'bg-slate-500'  : remaining <= 14 ? 'bg-slate-500'  : 'bg-slate-500'
        const stepDone = (cond: unknown) => cond ? 'text-slate-700' : 'text-gray-300'
        return (
          <Card>
            <CardHeader>
              <CardTitle>My Probation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline justify-between mb-2">
                <p className={`text-3xl font-bold ${toneText} tabular-nums`}>
                  {remaining < 0 ? `${Math.abs(remaining)}d overdue` : `${remaining}d remaining`}
                </p>
                <p className="text-xs text-gray-500">
                  {formatDate(p.startDate)} → {formatDate(p.endDate)}
                </p>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className={`h-full ${toneBg}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2 text-[11px]">
                <div className="text-center">
                  <CheckCircle2 className={`w-4 h-4 mx-auto ${stepDone(true)}`} />
                  <p className="mt-1 text-gray-600">Hired</p>
                </div>
                <div className="text-center">
                  <CheckCircle2 className={`w-4 h-4 mx-auto ${stepDone(p.settlingCheckInAt)}`} />
                  <p className="mt-1 text-gray-600">Settling check-in</p>
                </div>
                <div className="text-center">
                  <CheckCircle2 className={`w-4 h-4 mx-auto ${stepDone(p.status === 'UNDER_REVIEW' || p.outcomeEnactedAt)}`} />
                  <p className="mt-1 text-gray-600">Decision</p>
                </div>
                <div className="text-center">
                  <CheckCircle2 className={`w-4 h-4 mx-auto ${stepDone(p.outcomeEnactedAt)}`} />
                  <p className="mt-1 text-gray-600">Outcome</p>
                </div>
              </div>
              <p className="text-[11px] text-gray-500 mt-4">
                Your manager and HR will share the outcome with you once finalized.
              </p>
            </CardContent>
          </Card>
        )
      })()}

      {/* Today's Status */}
      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s Status</CardTitle>
        </CardHeader>
        <CardContent>
          <TimeClockCard
            hasClockIn={!!att?.clockIn}
            clockInTime={att?.clockIn ? formatTime(att.clockIn) : null}
            workType={att?.workType ?? null}
            hoursWorked={att?.hoursWorked ?? null}
            isClockedIn={isClockedIn}
          />
        </CardContent>
      </Card>

      {/* Leave Balance */}
      <Card>
        <CardHeader>
          <CardTitle>My Leave Balance</CardTitle>
        </CardHeader>
        <CardContent>
          {data.leaveBalances.length === 0 ? (
            <div>
              <p className="text-sm text-gray-400">No leave balances configured.</p>
              {viewerRole === 'HR_ADMIN' && (
                <SeedLeaveBalancesButton employeeId={employeeId} />
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {data.leaveBalances.map((b) => {
                const pct = b.allocated > 0 ? (b.remaining / b.allocated) * 100 : 0
                return (
                  <div
                    key={b.id}
                    className="rounded-xl border border-gray-200 bg-white p-4"
                  >
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-slate-50">
                        <CalendarDays className="w-4 h-4 text-slate-700" />
                      </div>
                      <p className="text-xs font-semibold text-gray-700">{b.leaveType}</p>
                    </div>
                    <p className="mt-3 text-xl font-bold text-gray-900">
                      {b.remaining}
                      <span className="text-sm font-medium text-gray-500">
                        /{b.allocated} days
                      </span>
                    </p>
                    <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full bg-slate-500 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Latest Payslip */}
        <Card>
          <CardHeader>
            <CardTitle>My Latest Payslip</CardTitle>
          </CardHeader>
          <CardContent>
            {!data.latestPayslip ? (
              <p className="text-sm text-gray-400">No payslip available yet.</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500">
                    {monthName(data.latestPayslip.month)} {data.latestPayslip.year}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {formatCurrency(data.latestPayslip.netSalary)}
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <Badge
                    variant={
                      data.latestPayslip.status === 'SENT' ||
                      data.latestPayslip.status === 'APPROVED'
                        ? 'success'
                        : 'warning'
                    }
                  >
                    {data.latestPayslip.status}
                  </Badge>
                  <Link
                    href="/dashboard/payroll"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-700"
                  >
                    View <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* My Tasks */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>My Tasks</CardTitle>
              <p className="text-xs text-gray-500 mt-1">
                Anything that needs your action — onboarding, reviews, policy sign-offs, document uploads.
              </p>
            </CardHeader>
            <CardContent>
              {limitedTasks.length === 0 ? (
                <div className="text-center py-6">
                  <CheckCircle2 className="w-8 h-8 text-slate-500 mx-auto" />
                  <p className="text-sm text-gray-500 mt-2">All caught up — no pending tasks.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {limitedTasks.map((t) => {
                    // Icon palette per task category — keeps the list scannable.
                    const Icon =
                      t.icon === 'policy'     ? FileText :
                      t.icon === 'leave'      ? CalendarDays :
                      t.icon === 'onboarding' ? CheckCircle2 :
                      t.icon === 'review'     ? UserCog :
                      t.icon === 'document'   ? FileText :
                      /* timesheet */            Clock
                    return (
                      <Link
                        key={t.key}
                        href={t.href}
                        className="flex items-center gap-3 py-2.5 px-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
                      >
                        <div className="p-1.5 rounded-lg bg-slate-50">
                          <Icon className="w-4 h-4 text-slate-700" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{t.label}</p>
                        </div>
                        <span className="text-xs font-semibold text-slate-700">{t.action}</span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Announcements */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Announcements</CardTitle>
        </CardHeader>
        <CardContent>
          {data.announcements.length === 0 ? (
            <p className="text-sm text-gray-400">No announcements.</p>
          ) : (
            <div className="space-y-3">
              {data.announcements.map((a) => (
                <div key={a.id} className="border-b border-gray-100 pb-3 last:border-0">
                  <div className="flex items-start gap-2">
                    {a.isPinned && <span className="text-slate-500 text-xs mt-0.5">★</span>}
                    <div>
                      <p className="text-sm font-medium text-gray-900">{a.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{a.content}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          href="/dashboard/leave"
          className="relative rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors p-4 border border-slate-100"
        >
          <CalendarDays className="w-5 h-5 text-slate-700" />
          <p className="mt-3 text-sm font-semibold text-slate-900">Request Leave</p>
          <ArrowUpRight className="w-4 h-4 text-slate-700 absolute top-3 right-3" />
        </Link>
        <Link
          href="/dashboard/payroll"
          className="relative rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors p-4 border border-slate-100"
        >
          <Banknote className="w-5 h-5 text-slate-700" />
          <p className="mt-3 text-sm font-semibold text-slate-900">View Payslip</p>
          <ArrowUpRight className="w-4 h-4 text-slate-700 absolute top-3 right-3" />
        </Link>
        <Link
          href="/dashboard/helpdesk"
          className="relative rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors p-4 border border-slate-100"
        >
          <LifeBuoy className="w-5 h-5 text-slate-700" />
          <p className="mt-3 text-sm font-semibold text-slate-900">Helpdesk</p>
          <ArrowUpRight className="w-4 h-4 text-slate-700 absolute top-3 right-3" />
        </Link>
        <Link
          href={emp ? `/dashboard/employees/${emp.id}` : '/dashboard/employees'}
          className="relative rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors p-4 border border-slate-100"
        >
          <UserCog className="w-5 h-5 text-slate-700" />
          <p className="mt-3 text-sm font-semibold text-slate-900">Update Profile</p>
          <ArrowUpRight className="w-4 h-4 text-slate-700 absolute top-3 right-3" />
        </Link>
      </div>

    </div>
  )
}
