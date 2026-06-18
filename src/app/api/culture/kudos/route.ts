import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

export async function GET() {
  const kudos = await prisma.kudos.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      from: { select: { id: true, fullName: true, employeeCode: true, photoUrl: true } },
      to: { select: { id: true, fullName: true, employeeCode: true, photoUrl: true, designation: true } },
    },
  })
  return NextResponse.json({ kudos })
}

export async function POST(request: NextRequest) {
  const c = await cookies()
  const tok = c.get('hr_token')?.value
  const payload = tok ? await verifyToken(tok) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, employee: { select: { id: true } } },
  })
  if (!me?.employee) return NextResponse.json({ error: 'No employee record' }, { status: 400 })

  const body = await request.json()
  const toId = String(body.toId || '')
  const message = String(body.message || '').trim()
  const category = String(body.category || 'APPRECIATION')

  if (!toId) return NextResponse.json({ error: 'Recipient required' }, { status: 400 })
  if (!message) return NextResponse.json({ error: 'Message required' }, { status: 400 })
  if (toId === me.employee.id) return NextResponse.json({ error: 'You cannot send kudos to yourself' }, { status: 400 })

  const created = await prisma.kudos.create({
    data: {
      fromId: me.employee.id,
      toId,
      message: message.slice(0, 1000),
      category,
    },
  })

  // Notify the recipient
  await prisma.notification.create({
    data: {
      employeeId: toId,
      type: 'GENERAL',
      title: 'You received kudos!',
      message: message.slice(0, 200),
      link: '/dashboard/culture?tab=recognition',
    },
  }).catch(() => {})

  return NextResponse.json({ kudos: created }, { status: 201 })
}
