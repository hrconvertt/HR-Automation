/**
 * POST /api/pulse/actions — an action plan against a driver (HR).
 * body: { driverKey, title, detail?, ownerId?, dueDate?: 'YYYY-MM-DD', roundId? }
 *
 * The owner is told. That is the whole point of writing the plan down.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'
import { resolveTalentAccess, cleanText, parseDay } from '@/lib/talent'
import { DRIVER_KEYS, driverLabel } from '@/lib/voice'

export async function POST(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (access.actualRole !== 'HR_ADMIN' || access.isPreviewMode) {
    return NextResponse.json({ error: 'Only HR writes action plans.' }, { status: 403 })
  }
  const body = (await request.json().catch(() => ({}))) as {
    driverKey?: string; title?: string; detail?: string; ownerId?: string; dueDate?: string; roundId?: string
  }
  const title = cleanText(body.title, 200)
  if (!body.driverKey || !DRIVER_KEYS.includes(body.driverKey) || !title) {
    return NextResponse.json({ error: 'Pick a driver and say what will be done.' }, { status: 400 })
  }
  let ownerId: string | null = null
  if (body.ownerId) {
    const o = await prisma.employee.findUnique({ where: { id: body.ownerId }, select: { id: true, status: true } })
    if (!o || o.status !== 'ACTIVE') return NextResponse.json({ error: 'The owner must be an active employee.' }, { status: 400 })
    ownerId = o.id
  }
  const dueDate = body.dueDate ? parseDay(body.dueDate) : null
  const action = await prisma.pulseAction.create({
    data: {
      driverKey: body.driverKey,
      title,
      detail: cleanText(body.detail, 2000),
      ownerId,
      dueDate,
      roundId: typeof body.roundId === 'string' && body.roundId ? body.roundId : null,
      createdById: access.userId,
    },
    select: { id: true },
  })
  if (ownerId && ownerId !== access.employeeId) {
    await notify({
      employeeId: ownerId,
      type: 'GENERAL',
      title: 'An engagement action is yours',
      message: `${access.userName} made you the owner of “${title}” (${driverLabel(body.driverKey)}).`,
      link: '/dashboard/culture/pulse?tab=improve',
    })
  }
  return NextResponse.json({ action }, { status: 201 })
}
