import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { notify } from '@/lib/notifications'

// HR confirms a suspected absconding case. Sets the employee status to
// TERMINATED + ABSCONDED-flagged via terminationType, deactivates login,
// and auto-opens an exit clearance with terminationType=INVOLUNTARY.
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const emp = await prisma.employee.findUnique({ where: { id }, select: { id: true, userId: true, fullName: true, status: true } })
  if (!emp) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const now = new Date()
  await prisma.employee.update({
    where: { id },
    data: { status: 'TERMINATED', exitDate: now, terminationType: 'INVOLUNTARY' },
  })
  if (emp.userId) {
    await prisma.user.update({ where: { id: emp.userId }, data: { isActive: false } }).catch(() => {})
  }

  await prisma.exitClearance.create({
    data: {
      employeeId: emp.id,
      initiatedById: payload.userId,
      lastWorkingDay: now,
    },
  }).catch(() => {})

  // Notify the rest of HR
  const hrUsers = await prisma.user.findMany({ where: { role: 'HR_ADMIN' }, select: { employee: { select: { id: true } } } })
  for (const u of hrUsers) {
    if (u.employee?.id && u.employee.id !== payload.userId) {
      await notify({
        employeeId: u.employee.id,
        type: 'GENERAL',
        title: 'Employee marked ABSCONDED',
        message: `${emp.fullName} has been flagged as absconding. Exit clearance opened.`,
        link: `/dashboard/lifecycle?tab=exit`,
      })
    }
  }

  return NextResponse.redirect(new URL('/dashboard', request.url), { status: 303 })
}
