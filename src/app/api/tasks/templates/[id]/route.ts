import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

async function requireHR() {
  const c = await cookies()
  const tok = c.get('hr_token')?.value
  const payload = tok ? await verifyToken(tok) : null
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const me = await prisma.user.findUnique({ where: { id: payload.userId }, select: { role: true } })
  if (!me || me.role !== 'HR_ADMIN') return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  if (c.get('hr_preview_role')?.value) return { error: NextResponse.json({ error: 'Preview mode' }, { status: 403 }) }
  return { ok: true as const }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireHR()
  if ('error' in guard) return guard.error
  const { id } = await params
  const body = await request.json()
  const data: Record<string, unknown> = {}
  if (body.name != null) data.name = String(body.name).trim()
  if (body.description !== undefined) data.description = body.description ? String(body.description) : null
  if (body.expectedHours != null) data.expectedHours = Number(body.expectedHours)
  if (body.complexity) data.complexity = String(body.complexity)
  if (body.departmentId !== undefined) data.departmentId = body.departmentId || null
  if (body.isActive !== undefined) data.isActive = !!body.isActive
  const updated = await prisma.taskTemplate.update({ where: { id }, data })
  return NextResponse.json({ template: updated })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireHR()
  if ('error' in guard) return guard.error
  const { id } = await params
  // Soft delete — preserve historical assignments
  await prisma.taskTemplate.update({ where: { id }, data: { isActive: false } })
  return NextResponse.json({ ok: true })
}
