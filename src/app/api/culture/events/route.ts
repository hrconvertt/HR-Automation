import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

export async function GET() {
  const events = await prisma.companyEvent.findMany({
    orderBy: { eventDate: 'desc' },
    take: 200,
  })
  return NextResponse.json({ events })
}

export async function POST(request: NextRequest) {
  const c = await cookies()
  const tok = c.get('hr_token')?.value
  const payload = tok ? verifyToken(tok) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true },
  })
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const previewRole = c.get('hr_preview_role')?.value
  const effectiveRole = previewRole && me.role === 'HR_ADMIN' ? previewRole : me.role
  if (effectiveRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'HR only' }, { status: 403 })
  }
  if (c.get('hr_preview_role')?.value) {
    return NextResponse.json({ error: 'Preview mode cannot create' }, { status: 403 })
  }

  const body = await request.json()
  const title = String(body.title || '').trim()
  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 })
  if (!body.eventDate) return NextResponse.json({ error: 'Event date required' }, { status: 400 })

  const created = await prisma.companyEvent.create({
    data: {
      title,
      description: body.description ? String(body.description).slice(0, 2000) : null,
      eventDate: new Date(body.eventDate),
      location: body.location ? String(body.location).slice(0, 200) : null,
      category: String(body.category || 'GENERAL'),
      createdById: me.id,
    },
  })
  return NextResponse.json({ event: created }, { status: 201 })
}
