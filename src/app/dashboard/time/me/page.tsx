/**
 * /dashboard/time/me — personal time view for the signed-in user.
 *
 * Available to all roles. HR_ADMIN / EXECUTIVE without an employee record
 * see a friendly notice.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import MyTimeView from '@/app/dashboard/attendance/_views/my-time-view'
import { TimesheetPanel } from '../_components/timesheet-panel'

export default async function MyTimePage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
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

  return (
    <div className="space-y-6">
      <MyTimeView employeeId={user.employee.id} employeeName={user.employee.fullName ?? ''} />
      {(timeTrackingMode === 'TIMESHEET' || timeTrackingMode === 'JOBS') && (
        <TimesheetPanel mode={timeTrackingMode} categories={timesheetCategories} />
      )}
    </div>
  )
}
