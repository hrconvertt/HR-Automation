/**
 * GET  /api/recruiting/requisitions/[id]/knockouts — HR-only. Returns criteria.
 * POST /api/recruiting/requisitions/[id]/knockouts — HR-only. Body:
 *   { criteria: [{type, value, isHard}, ...] }
 *   Replaces all knockout criteria for the requisition.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

interface RouteParams { params: Promise<{ id: string }> }

const VALID_TYPES = new Set(['WORK_AUTH', 'LOCATION', 'SKILL', 'MIN_YEARS', 'MIN_EDUCATION', 'LANGUAGE'])

async function requireHR(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const me = await prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true, role: true } })
  if (!me || me.role !== 'HR_ADMIN') {
    return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  }
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return { error: NextResponse.json({ error: 'Switch back to HR view to manage knockout filters' }, { status: 403 }) }
  }
  return { me }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await requireHR(request)
  if ('error' in auth) return auth.error
  const { id } = await params
  const criteria = await prisma.knockoutCriterion.findMany({
    where: { requisitionId: id },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ criteria })
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await requireHR(request)
  if ('error' in auth) return auth.error
  const { id } = await params

  const req = await prisma.jobRequisition.findUnique({ where: { id }, select: { id: true } })
  if (!req) return NextResponse.json({ error: 'Requisition not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const incoming = Array.isArray(body.criteria) ? body.criteria : []

  // Validate + sanitize
  const sanitized: Array<{ type: string; value: string; isHard: boolean }> = []
  for (const c of incoming) {
    const type = String(c?.type || '').toUpperCase()
    const value = String(c?.value || '').trim().slice(0, 500)
    if (!VALID_TYPES.has(type)) continue
    if (!value) continue
    sanitized.push({ type, value, isHard: c?.isHard !== false })
  }

  // Replace-all semantics
  await prisma.$transaction([
    prisma.knockoutCriterion.deleteMany({ where: { requisitionId: id } }),
    ...(sanitized.length > 0
      ? [prisma.knockoutCriterion.createMany({
          data: sanitized.map((s) => ({ requisitionId: id, ...s })),
        })]
      : []),
  ])

  // Audit
  await prisma.auditLog.create({
    data: {
      userId: auth.me.id,
      action: 'UPDATE',
      entity: 'KnockoutCriterion',
      entityId: id,
      newValue: JSON.stringify(sanitized),
    },
  }).catch(() => { /* audit failures shouldn't break the save */ })

  return NextResponse.json({ ok: true, count: sanitized.length })
}
