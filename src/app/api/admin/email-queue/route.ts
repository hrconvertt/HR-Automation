/**
 * GET  /api/admin/email-queue?status=DRAFT|QUEUED|SENT|FAILED|SUPPRESSED
 *      Lists EmailSend rows for HR_ADMIN.
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

async function requireHR() {
  const c = await cookies()
  const tok = c.get('hr_token')?.value
  const payload = await verifyToken(tok)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const me = await prisma.user.findUnique({ where: { id: payload.userId }, select: { role: true } })
  if (!me || me.role !== 'HR_ADMIN') return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  return { ok: true as const, userId: payload.userId }
}

export async function GET(request: NextRequest) {
  const guard = await requireHR()
  if ('error' in guard) return guard.error
  const status = request.nextUrl.searchParams.get('status') || 'DRAFT'
  const sends = await prisma.emailSend.findMany({
    where: { status },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { template: { select: { id: true, key: true, name: true, category: true } } },
  })
  return NextResponse.json({ sends })
}
