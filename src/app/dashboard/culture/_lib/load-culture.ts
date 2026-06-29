import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * Shared data loader for the People & Culture sub-routes. Returns
 * everything needed by Events / Recognition / Birthdays / Anniversaries.
 * Each sub-route picks what it needs and renders the appropriate section.
 */
export async function loadCultureContext() {
  const c = await cookies()
  const tok = c.get('hr_token')?.value
  const payload = tok ? await verifyToken(tok) : null
  if (!payload) redirect('/login')

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      role: true,
      employee: {
        select: { id: true, fullName: true, departmentId: true, reportingManagerId: true },
      },
    },
  })
  if (!me) redirect('/login')

  const previewRole = me.role === 'HR_ADMIN' ? c.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? me.role
  const isHR = effectiveRole === 'HR_ADMIN' && !previewRole

  const seesCompanyWide =
    effectiveRole === 'HR_ADMIN' ||
    effectiveRole === 'EXECUTIVE' ||
    !me.employee
  const scopedDepartmentId = seesCompanyWide ? null : me.employee?.departmentId ?? null

  const now = new Date()
  const thisYear = now.getFullYear()
  const thisMonth = now.getMonth()
  const nextMonth = (thisMonth + 1) % 12

  const [events, kudos, employees] = await Promise.all([
    prisma.companyEvent.findMany({ orderBy: { eventDate: 'desc' }, take: 50 }),
    prisma.kudos.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        from: { select: { id: true, fullName: true, employeeCode: true } },
        to: { select: { id: true, fullName: true, designation: true } },
      },
    }),
    prisma.employee.findMany({
      where: {
        status: 'ACTIVE',
        ...(scopedDepartmentId ? { departmentId: scopedDepartmentId } : {}),
      },
      select: { id: true, fullName: true, employeeCode: true, designation: true, dob: true, joiningDate: true, department: { select: { name: true } } },
      orderBy: { fullName: 'asc' },
    }),
  ])

  const birthdays = employees
    .filter((e) => e.dob)
    .map((e) => {
      const d = new Date(e.dob!)
      return { ...e, dobMonth: d.getMonth(), dobDay: d.getDate() }
    })
    .filter((e) => e.dobMonth === thisMonth || e.dobMonth === nextMonth)
    .sort((a, b) => {
      const sa = a.dobMonth === thisMonth ? 0 : 1
      const sb = b.dobMonth === thisMonth ? 0 : 1
      if (sa !== sb) return sa - sb
      return a.dobDay - b.dobDay
    })

  const anniversaries = employees
    .map((e) => {
      const d = new Date(e.joiningDate)
      const years = thisYear - d.getFullYear()
      return { ...e, joinMonth: d.getMonth(), joinDay: d.getDate(), years }
    })
    .filter((e) => (e.joinMonth === thisMonth || e.joinMonth === nextMonth) && e.years > 0)
    .sort((a, b) => {
      const sa = a.joinMonth === thisMonth ? 0 : 1
      const sb = b.joinMonth === thisMonth ? 0 : 1
      if (sa !== sb) return sa - sb
      return a.joinDay - b.joinDay
    })

  const upcomingEvents = events.filter((e) => e.eventDate >= now)
  const pastEvents = events.filter((e) => e.eventDate < now).slice(0, 20)

  return {
    isHR,
    me,
    employees,
    upcomingEvents,
    pastEvents,
    kudos,
    birthdays,
    anniversaries,
    thisYear,
  }
}
