/**
 * POST /api/policies/[id]/acknowledge
 *
 * Rules:
 *   - Policy must be PUBLISHED (drafts and archived can't be acknowledged).
 *   - Caller's role must be in the policy's audience.
 *   - If already SIGNED, no-op — don't refresh signedAt. Acknowledgements
 *     are immutable historical events; re-posting shouldn't move them.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { canAcknowledgePolicy } from '@/lib/policy-access'

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  if (!user?.employee) return NextResponse.json({ error: 'No employee linked' }, { status: 400 })

  const { id } = await params
  const policy = await prisma.policyDocument.findUnique({
    where: { id },
    select: { status: true, audience: true, requiresAck: true },
  })
  if (!policy) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // ── Audience + published guard ───────────────────────────────────────
  if (!canAcknowledgePolicy(policy, payload.role)) {
    return NextResponse.json(
      { error: 'You cannot acknowledge this policy.' },
      { status: 403 },
    )
  }
  if (!policy.requiresAck) {
    return NextResponse.json(
      { error: "This policy doesn't require acknowledgement." },
      { status: 400 },
    )
  }

  // ── Idempotency: if already signed, return the existing row unchanged ─
  const existing = await prisma.policyAcknowledgment.findUnique({
    where: { policyId_employeeId: { policyId: id, employeeId: user.employee.id } },
  })
  if (existing?.status === 'SIGNED') {
    return NextResponse.json({ ack: existing, alreadySigned: true })
  }

  const ack = await prisma.policyAcknowledgment.upsert({
    where: { policyId_employeeId: { policyId: id, employeeId: user.employee.id } },
    update: { status: 'SIGNED', signedAt: new Date() },
    create: {
      policyId: id,
      employeeId: user.employee.id,
      status: 'SIGNED',
      signedAt: new Date(),
    },
  })
  return NextResponse.json({ ack })
}
