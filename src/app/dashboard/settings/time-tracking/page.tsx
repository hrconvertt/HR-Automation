import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { TimeTrackingSettings } from './settings-client'

export default async function TimeTrackingSettingsPage() {
  const c = await cookies()
  const tok = c.get('hr_token')?.value
  const payload = await verifyToken(tok)
  if (!payload) redirect('/login')
  const user = await prisma.user.findUnique({ where: { id: payload.userId } })
  if (!user || user.role !== 'HR_ADMIN') redirect('/dashboard')

  const modeRow = await prisma.config.findUnique({ where: { key: 'timeTrackingMode' } })
  const catRow = await prisma.config.findUnique({ where: { key: 'timesheetCategories' } })
  const mode = (['BASIC', 'TIMESHEET', 'JOBS'] as const).includes(
    (modeRow?.value ?? '') as 'BASIC' | 'TIMESHEET' | 'JOBS',
  )
    ? (modeRow!.value as 'BASIC' | 'TIMESHEET' | 'JOBS')
    : 'BASIC'
  const categories = catRow?.value ?? 'Dev\nQA\nMeetings\nAdmin'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Time Tracking</h1>
        <p className="text-sm text-slate-500 mt-1">
          Choose how employees record their time. Switching modes affects the My Time page.
        </p>
      </div>
      <TimeTrackingSettings initialMode={mode} initialCategories={categories} />
    </div>
  )
}
