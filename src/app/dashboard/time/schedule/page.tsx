/**
 * My Schedule — your week, shift by shift.
 *
 * The web version of Workday's schedule: a week you can step through, a strip
 * of days with a dot under each one you work, and the shifts listed day by
 * day with where and for how long. Worked out from your standing hours, the
 * holidays HR has applied, your approved leave, and any exceptions — see
 * src/lib/schedule.ts.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildSchedule, weekStart, isoDay, utcDay, todayKeyPK } from '@/lib/schedule'
import { MySchedule } from './_components/my-schedule'

/** Which week, and what today is — an ordinary function, so the clock is not read during render. */
function resolveWeek(param?: string) {
  const todayKey = todayKeyPK()
  const base = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? utcDay(param) : utcDay(todayKey)
  return { week: isoDay(weekStart(base)), todayKey }
}

export default async function MySchedulePage({
  searchParams,
}: {
  searchParams?: Promise<{ week?: string }>
}) {
  const sp = (await searchParams) ?? {}
  const payload = await verifyToken((await cookies()).get('hr_token')?.value)
  if (!payload) redirect('/login')

  const empId = payload.employeeId ?? null
  if (!empId) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
        <p className="text-sm font-medium text-slate-800">Your sign-in is not linked to an employee record.</p>
        <p className="text-xs text-slate-500 mt-1">A schedule belongs to a person, so there is nothing to show here yet.</p>
      </div>
    )
  }

  const { week, todayKey } = resolveWeek(sp.week)
  const [[me], pref, employee] = await Promise.all([
    buildSchedule([empId], utcDay(week), 7),
    prisma.schedulePreference.findUnique({ where: { employeeId: empId } }),
    prisma.employee.findUnique({ where: { id: empId }, select: { designation: true } }),
  ])

  return (
    <MySchedule
      week={week}
      todayKey={todayKey}
      person={me}
      designation={employee?.designation ?? null}
      preference={pref
        ? {
          weeklyHours: pref.weeklyHours,
          location: pref.location,
          preferredDays: pref.preferredDays ? pref.preferredDays.split(',') : [],
          onCall: pref.onCall,
          standby: pref.standby,
          effectiveFrom: isoDay(pref.effectiveFrom),
          note: pref.note,
          updatedAt: pref.updatedAt.toISOString(),
        }
        : null}
    />
  )
}
