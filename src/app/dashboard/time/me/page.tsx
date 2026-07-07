/**
 * /dashboard/time/me — personal time view for the signed-in user.
 *
 * Available to all roles. HR_ADMIN / EXECUTIVE without an employee record
 * see a friendly notice.
 */

import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getPayrollConfig } from '@/lib/config'
import MyTimeView from '@/app/dashboard/attendance/_views/my-time-view'
import { TimesheetPanel } from '../_components/timesheet-panel'

/**
 * Find recent days where the employee clocked in but never clocked out.
 * Past days always qualify; today only counts once we're 2h past end-of-day
 * (so an evening worker isn't nagged mid-shift). Data is never auto-fixed —
 * the banner routes to the attendance correction flow.
 */
async function findDanglingClockOuts(employeeId: string): Promise<Date[]> {
  const cfg = await getPayrollConfig()
  const now = new Date()
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const lookback = new Date(todayStart); lookback.setDate(lookback.getDate() - 7)

  const logs = await prisma.attendanceLog.findMany({
    where: {
      employeeId,
      date: { gte: lookback, lte: now },
      clockIn: { not: null },
      clockOut: null,
      status: { in: ['PRESENT', 'LATE'] },
    },
    select: { date: true },
    orderBy: { date: 'asc' },
  })

  const pastEODToday = now.getHours() >= cfg.endOfDayHour + 2
  const dangling: Date[] = []
  for (const l of logs) {
    const isToday = l.date >= todayStart
    if (!isToday || pastEODToday) {
      // Skip days where the person is legitimately still clocked in right now
      // (today before the cutoff is excluded above; past days are always stale)
      dangling.push(l.date)
    }
  }
  return dangling
}

export default async function MyTimePage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true, fullName: true } } },
  })
  if (!user) redirect('/login')

  if (!user.employee) {
    return (
      <div className="rounded-2xl bg-gray-50 border border-gray-200 p-6 text-sm text-gray-600">
        No personal time record for this account.
      </div>
    )
  }

  const modeRow = await prisma.config.findUnique({ where: { key: 'timeTrackingMode' } })
  const catRow = await prisma.config.findUnique({ where: { key: 'timesheetCategories' } })
  const timeTrackingMode: 'BASIC' | 'TIMESHEET' | 'JOBS' = (
    ['BASIC', 'TIMESHEET', 'JOBS'] as const
  ).includes((modeRow?.value ?? '') as 'BASIC' | 'TIMESHEET' | 'JOBS')
    ? (modeRow!.value as 'BASIC' | 'TIMESHEET' | 'JOBS')
    : 'BASIC'
  const timesheetCategories = (catRow?.value ?? 'Dev\nQA\nMeetings\nAdmin')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

  const dangling = await findDanglingClockOuts(user.employee.id)

  return (
    <div className="space-y-6">
      {dangling.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <span className="text-amber-600 mt-0.5" aria-hidden>&#9888;</span>
          <div className="text-sm text-amber-900">
            <p className="font-semibold">
              You forgot to clock out on{' '}
              {dangling
                .map((d) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }))
                .join(', ')}
              .
            </p>
            <p className="text-xs mt-0.5 text-amber-800">
              Your hours for {dangling.length === 1 ? 'that day' : 'those days'} are incomplete.{' '}
              <Link href="/dashboard/attendance/corrections" className="font-medium underline underline-offset-2">
                Request a correction
              </Link>{' '}
              so HR can log the right clock-out time.
            </p>
          </div>
        </div>
      )}
      <MyTimeView employeeId={user.employee.id} employeeName={user.employee.fullName ?? ''} />
      {(timeTrackingMode === 'TIMESHEET' || timeTrackingMode === 'JOBS') && (
        <TimesheetPanel mode={timeTrackingMode} categories={timesheetCategories} />
      )}
    </div>
  )
}
