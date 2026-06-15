/**
 * PATCH  /api/positions/[id] - update a position (HR only)
 * DELETE /api/positions/[id] - soft-deactivate (sets active=false)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { isValidPositionLevel } from '@/lib/position-levels'

async function requireHR(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const me = await prisma.user.findUnique({ where: { id: payload.userId }, select: { role: true } })
  if (!me || me.role !== 'HR_ADMIN') {
    return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  }
  return { ok: true as const }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const guard = await requireHR(request)
  if ('error' in guard) return guard.error
  const { id } = await context.params
  const body = await request.json()

  const data: Record<string, unknown> = {}
  if (typeof body.title === 'string') data.title = body.title.trim()
  if (typeof body.level === 'string') {
    if (!isValidPositionLevel(body.level)) {
      return NextResponse.json({ error: 'Invalid level' }, { status: 400 })
    }
    data.level = body.level
  }
  if ('departmentId' in body) data.departmentId = body.departmentId || null
  if ('description' in body) data.description = body.description ? String(body.description).trim() : null
  if (typeof body.active === 'boolean') data.active = body.active

  const position = await prisma.position.update({ where: { id }, data })
  return NextResponse.json({ position })
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const guard = await requireHR(request)
  if ('error' in guard) return guard.error
  const { id } = await context.params

  // Soft-delete: deactivate. Hard-delete only if no employees attached.
  const count = await prisma.employee.count({ where: { positionId: id } })
  if (count > 0) {
    await prisma.position.update({ where: { id }, data: { active: false } })
    return NextResponse.json({ deactivated: true, employeeCount: count })
  }
  await prisma.position.delete({ where: { id } })
  return NextResponse.json({ deleted: true })
}
