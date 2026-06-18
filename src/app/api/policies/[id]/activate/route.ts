import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { notifyMany } from '@/lib/notifications'
import { triggerEmail, employeeVars } from '@/lib/email-triggers'
import { parseAudienceRoles } from '@/lib/policy-access'

interface RouteParams { params: Promise<{ id: string }> }

/**
 * HR activates an APPROVED policy.
 *
 * Side effects:
 *   - policy.status -> ACTIVE + activatedAt/ById (also fills legacy publishedAt
 *     so old code paths reading publishedAt keep working).
 *   - Creates an Announcement ("New Policy: {title}").
 *   - Notifies all ACTIVE employees in-app.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view' }, { status: 403 })
  }

  const { id } = await params
  const policy = await prisma.policyDocument.findUnique({ where: { id } })
  if (!policy) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (policy.status !== 'APPROVED') {
    return NextResponse.json({ error: 'Only APPROVED policies can be activated' }, { status: 400 })
  }

  const now = new Date()
  await prisma.policyDocument.update({
    where: { id },
    data: {
      status: 'ACTIVE',
      activatedAt: now,
      activatedById: payload.userId,
      // Keep legacy publishedAt populated so older read paths still work.
      publishedAt: policy.publishedAt ?? now,
    },
  })

  const categoryLabel = policy.category.toLowerCase().replace(/_/g, ' ')
  await prisma.announcement.create({
    data: {
      title: `New Policy: ${policy.title}`,
      content: `A new ${categoryLabel} policy has been activated. Please review.`,
      audience: 'ALL',
      isPinned: true,
      publishedAt: now,
      createdById: payload.userId,
    },
  })

  // ── Restrict fan-out to employees whose linked user role is in the policy's audienceRoles.
  // Employees with no User row (or unknown role) get the notification by default — they
  // appear in the org as standard EMPLOYEE-equivalents.
  const audienceRoles = parseAudienceRoles(policy.audienceRoles)
  const allEmps = await prisma.employee.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, fullName: true, user: { select: { role: true } } },
  })
  const inAudience = allEmps.filter((e) => {
    const role = e.user?.role ?? 'EMPLOYEE'
    if (role === 'HR_ADMIN') return false // HR sees policies via the HR view, no need to spam them.
    return audienceRoles.includes(role)
  })

  await notifyMany(inAudience.map((e) => e.id), {
    type: 'GENERAL',
    title: '📄 New policy activated',
    message: `${policy.title} — please review`,
    link: `/dashboard/policies/${id}`,
  })

  // CUL-05 policy.published — one email per employee in audience
  const employees = inAudience
  for (const e of inAudience) {
    await triggerEmail({
      event: 'policy.published',
      employeeId: e.id,
      variables: {
        ...employeeVars({ fullName: e.fullName, designation: null, department: null }),
        'Policy Title': policy.title,
        'Category': categoryLabel,
      },
      createdById: payload.userId,
      dedupeSalt: id,
    })
  }

  return NextResponse.json({ ok: true, notified: employees.length })
}
