/**
 * POST /api/recruiting/candidates/bulk â€” HR or Manager.
 *
 *   Body:
 *     { action: 'MOVE_TOP_N_TO_SCREENING', requisitionId: string, n: number }
 *     { action: 'REJECT_REMAINING',        requisitionId: string, keepIds: string[] }
 *
 *   Used by the Kanban "Move top N" + "Reject remaining" buttons.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = await prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true, role: true } })
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const previewRole = request.cookies.get('hr_preview_role')?.value
  const effectiveRole = (previewRole && me.role === 'HR_ADMIN') ? previewRole : me.role
  if (!['HR_ADMIN', 'MANAGER'].includes(effectiveRole)) {
    return NextResponse.json({ error: 'Only HR or Manager' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const action = String(body?.action || '')
  const requisitionId = body?.requisitionId ? String(body.requisitionId) : null
  if (!requisitionId) return NextResponse.json({ error: 'requisitionId required' }, { status: 400 })

  if (action === 'MOVE_TOP_N_TO_SCREENING') {
    const n = Math.max(1, Math.min(50, Number(body?.n) || 10))
    const top = await prisma.candidate.findMany({
      where: {
        requisitionId,
        stage: 'APPLIED',
        knockoutStatus: { in: ['PASSED', 'OVERRIDDEN'] },
      },
      orderBy: [{ matchScore: 'desc' }, { createdAt: 'desc' }],
      take: n,
      select: { id: true },
    })
    if (top.length === 0) return NextResponse.json({ ok: true, moved: 0 })
    await prisma.candidate.updateMany({
      where: { id: { in: top.map((c) => c.id) } },
      data: { stage: 'SCREENING' },
    })
    return NextResponse.json({ ok: true, moved: top.length })
  }

  if (action === 'REJECT_REMAINING') {
    const keepIds: string[] = Array.isArray(body?.keepIds) ? body.keepIds.map(String) : []
    const result = await prisma.candidate.updateMany({
      where: {
        requisitionId,
        stage: { in: ['APPLIED', 'SCREENING'] },
        knockoutStatus: { in: ['PASSED', 'OVERRIDDEN'] },
        ...(keepIds.length > 0 ? { id: { notIn: keepIds } } : {}),
      },
      data: { stage: 'REJECTED' },
    })
    return NextResponse.json({ ok: true, rejected: result.count })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
