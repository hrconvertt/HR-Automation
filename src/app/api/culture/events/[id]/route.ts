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
  if (c.get('hr_preview_role')?.value) {
    return { error: NextResponse.json({ error: 'Preview mode cannot modify' }, { status: 403 }) }
  }
  return { ok: true as const }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireHR()
  if ('error' in guard) return guard.error
  const { id } = await params
  const body = await request.json()
  const data: Record<string, unknown> = {}
  if (body.title != null) data.title = String(body.title).trim()
  if (body.description !== undefined) data.description = body.description ? String(body.description).slice(0, 2000) : null
  if (body.eventDate) data.eventDate = new Date(body.eventDate)
  if (body.location !== undefined) data.location = body.location ? String(body.location).slice(0, 200) : null
  if (body.category) data.category = String(body.category)
  const updated = await prisma.companyEvent.update({ where: { id }, data })
  return NextResponse.json({ event: updated })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireHR()
  if ('error' in guard) return guard.error
  const { id } = await params
  await prisma.companyEvent.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
