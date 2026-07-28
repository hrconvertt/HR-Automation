import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { canSeePolicy, resolveAudienceEmployeeIds, ALLOWED_AUDIENCE_ROLES } from '@/lib/policy-access'

interface RouteParams { params: Promise<{ id: string }> }

async function checkAccess(request: NextRequest, policyId: string) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const policy = await prisma.policyDocument.findUnique({
    where: { id: policyId },
    include: { acknowledgments: { select: { status: true, employeeId: true, signedAt: true } } },
  })
  if (!policy) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  return { payload, policy }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const r = await checkAccess(request, id)
  if (r.error) return r.error
  // ── Visibility check: non-HR users can only see PUBLISHED policies in their
  //    audience. Without this guard, anyone could GET a DRAFT or HR_ONLY policy.
  if (!canSeePolicy(r.policy, r.payload.role)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ policy: r.policy })
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view' }, { status: 403 })
  }

  const existing = await prisma.policyDocument.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const allowed: Record<string, unknown> = {}
  for (const k of [
    'title', 'type', 'category', 'description', 'content', 'url',
    'version', 'audience', 'requiresAck', 'status',
  ]) {
    if (body[k] !== undefined) allowed[k] = body[k]
  }
  if (body.effectiveDate !== undefined) {
    allowed.effectiveDate = body.effectiveDate ? new Date(body.effectiveDate) : null
  }

  // Validate + store audienceRoles (JSON-encoded string).
  if (body.audienceRoles !== undefined) {
    if (!Array.isArray(body.audienceRoles) || body.audienceRoles.length === 0) {
      return NextResponse.json({ error: 'audienceRoles must be a non-empty array' }, { status: 400 })
    }
    for (const r of body.audienceRoles) {
      if (typeof r !== 'string' || !ALLOWED_AUDIENCE_ROLES.includes(r)) {
        return NextResponse.json({ error: `Invalid role in audienceRoles: ${r}` }, { status: 400 })
      }
    }
    allowed.audienceRoles = JSON.stringify(body.audienceRoles)
  }

  // ── Detect a meaningful content change on a published policy. If the
  //    caller opts in to `invalidateAcks=true`, bump the version and reset
  //    all SIGNED acks to PENDING (re-acknowledgement required). Otherwise
  //    the edit is treated as a minor revision and old acks stay valid.
  const contentChanged = existing.status === 'PUBLISHED'
    && body.content !== undefined
    && body.content !== existing.content
  const requestedReAck = body.invalidateAcks === true

  if (contentChanged && requestedReAck) {
    // Auto-bump version (unless caller passed an explicit version)
    if (body.version === undefined) {
      const cur = parseFloat(existing.version || '1.0')
      allowed.version = isNaN(cur) ? '1.1' : (cur + 0.1).toFixed(1)
    }
  }

  const policy = await prisma.policyDocument.update({ where: { id }, data: allowed })

  // ── Side-effects: ack invalidation + audience drift reconciliation ───
  await prisma.$transaction(async (tx) => {
    if (contentChanged && requestedReAck) {
      // Reset all SIGNED acks back to PENDING so employees re-acknowledge
      await tx.policyAcknowledgment.updateMany({
        where: { policyId: id, status: 'SIGNED' },
        data: { status: 'PENDING', signedAt: null, notifiedAt: null },
      })
    }

    // If audience changed AND policy is PUBLISHED, reconcile ack rows.
    const audienceChanged = body.audience !== undefined && body.audience !== existing.audience
    if (audienceChanged && policy.status === 'PUBLISHED' && policy.requiresAck) {
      const newAudienceIds = await resolveAudienceEmployeeIds(tx as unknown as typeof prisma, policy.audience)
      const newSet = new Set(newAudienceIds)
      // Add ack rows for newly-in employees
      for (const eid of newAudienceIds) {
        await tx.policyAcknowledgment.upsert({
          where: { policyId_employeeId: { policyId: id, employeeId: eid } },
          update: {}, // leave existing acks alone
          create: { policyId: id, employeeId: eid, status: 'PENDING' },
        })
      }
      // Remove ack rows for newly-out employees, but only those still PENDING
      // (preserve SIGNED rows as historical audit trail).
      await tx.policyAcknowledgment.deleteMany({
        where: {
          policyId: id,
          status: 'PENDING',
          employeeId: { notIn: Array.from(newSet) },
        },
      })
    }
  })

  return NextResponse.json({
    policy,
    invalidatedAcks: contentChanged && requestedReAck,
  })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view' }, { status: 403 })
  }
  // Soft delete via archive instead of hard-delete to keep audit
  await prisma.policyDocument.update({
    where: { id },
    data: { status: 'ARCHIVED', archivedAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
