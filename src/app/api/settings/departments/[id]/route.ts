import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

interface RouteParams { params: Promise<{ id: string }> }

async function gateHR(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return { error: 'Unauthorized', status: 401 as const }
  const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { role: true } })
  if (!user || user.role !== 'HR_ADMIN') return { error: 'Forbidden', status: 403 as const }
  return { ok: true as const }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const gate = await gateHR(request)
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const data: { name?: string; code?: string; headEmployeeId?: string | null } = {}
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
  if (typeof body.code === 'string' && body.code.trim()) data.code = body.code.trim().toUpperCase()
  if ('headEmployeeId' in body) data.headEmployeeId = body.headEmployeeId || null

  const updated = await prisma.department.update({ where: { id }, data })
  return NextResponse.json({ department: updated })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const gate = await gateHR(request)
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await params

  const activeCount = await prisma.employee.count({
    where: { departmentId: id, status: 'ACTIVE' },
  })
  if (activeCount > 0) {
    return NextResponse.json(
      { error: `Reassign these employees first. ${activeCount} active employee${activeCount === 1 ? '' : 's'} still in this department.` },
      { status: 409 },
    )
  }

  await prisma.department.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
