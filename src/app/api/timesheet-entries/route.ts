import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function getMe() {
  const c = await cookies()
  const tok = c.get('hr_token')?.value
  const payload = tok ? await verifyToken(tok) : null
  if (!payload) return null
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  return user
}

export async function GET(request: NextRequest) {
  const user = await getMe()
  if (!user?.employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const where: Record<string, unknown> = { employeeId: user.employee.id }
  if (from || to) {
    const range: Record<string, Date> = {}
    if (from) range.gte = new Date(from)
    if (to) range.lte = new Date(to)
    where.date = range
  }
  const entries = await prisma.timesheetEntry.findMany({
    where,
    orderBy: [{ date: 'desc' }, { createdAt: 'asc' }],
  })
  return NextResponse.json({ entries })
}

export async function POST(request: NextRequest) {
  const user = await getMe()
  if (!user?.employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const dateStr = body.date ?? new Date().toISOString().slice(0, 10)
  const date = new Date(dateStr)
  const category = body.category ? String(body.category) : null
  const hours = Number(body.hours ?? 0)
  const taskId = body.taskId ? String(body.taskId) : null
  const notes = body.notes ? String(body.notes) : null

  if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
    return NextResponse.json({ error: 'Invalid hours' }, { status: 400 })
  }

  // Replace any existing row matching (employee, date, category, taskId)
  const existing = await prisma.timesheetEntry.findFirst({
    where: {
      employeeId: user.employee.id,
      date,
      category,
      taskId,
    },
  })

  if (existing) {
    if (hours === 0) {
      await prisma.timesheetEntry.delete({ where: { id: existing.id } })
      return NextResponse.json({ ok: true, deleted: true })
    }
    const updated = await prisma.timesheetEntry.update({
      where: { id: existing.id },
      data: { hours, notes },
    })
    return NextResponse.json({ ok: true, entry: updated })
  }

  if (hours === 0) return NextResponse.json({ ok: true })

  const created = await prisma.timesheetEntry.create({
    data: {
      employeeId: user.employee.id,
      date,
      category,
      hours,
      taskId,
      notes,
    },
  })
  return NextResponse.json({ ok: true, entry: created })
}
