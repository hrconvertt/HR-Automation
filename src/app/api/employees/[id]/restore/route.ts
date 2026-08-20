/**
 * POST /api/employees/[id]/restore — take a record back out of Trash.
 *
 * Puts the person back exactly where they were: the status they held before
 * being trashed, their login reactivated, and the trash markers cleared. The
 * opposite of the `trash` DELETE mode.
 *
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteParams) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const preview = request.cookies.get('hr_preview_role')?.value
  if (preview && preview !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to restore employees' }, { status: 403 })
  }

  const { id } = await params
  const emp = await prisma.employee.findUnique({
    where: { id },
    include: { user: { select: { id: true } } },
  })
  if (!emp) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!emp.deletedAt) {
    return NextResponse.json({ error: 'That record is not in the trash' }, { status: 400 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id },
      data: {
        // Back to the status it held before trashing; ACTIVE if that was lost.
        status: emp.preDeleteStatus ?? 'ACTIVE',
        deletedAt: null,
        deletedById: null,
        deleteReason: null,
        preDeleteStatus: null,
      },
    })
    if (emp.user) {
      await tx.user.update({ where: { id: emp.user.id }, data: { isActive: true } })
    }
  })

  try {
    await prisma.auditLog.create({
      data: {
        userId: payload.userId,
        employeeId: id,
        action: 'UPDATE',
        entity: 'Employee',
        entityId: id,
        newValue: JSON.stringify({ restored: true, status: emp.preDeleteStatus ?? 'ACTIVE' }),
      },
    })
  } catch (auditErr) {
    console.error('[audit] Employee restore', auditErr)
  }

  return NextResponse.json({ ok: true, status: emp.preDeleteStatus ?? 'ACTIVE' })
}
