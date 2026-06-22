import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { notify } from '@/lib/notifications'

interface RouteParams { params: Promise<{ id: string }> }

/**
 * POST /api/employees/[id]/role-history
 *
 * HR-only. Manually adds a role history entry — title (designation),
 * optional manager, effective date, notes. Optionally notifies the
 * employee.
 *
 * Body:
 *   {
 *     title?: string             // e.g. "Senior Designer"
 *     managerId?: string | null  // new manager id
 *     effectiveDate?: string     // ISO date; defaults to today
 *     notes?: string
 *     reason?: string            // legacy field; mirrors `notes` if absent
 *     notify?: boolean           // notify employee?
 *   }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const {
    title, managerId, effectiveDate, notes, reason, notify: shouldNotify,
  } = body as {
    title?: string
    managerId?: string | null
    effectiveDate?: string
    notes?: string
    reason?: string
    notify?: boolean
  }

  if (!title?.trim() && !managerId && !notes?.trim() && !reason?.trim()) {
    return NextResponse.json({ error: 'Provide at least a title, manager, or notes.' }, { status: 400 })
  }

  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { id: true, reportingManagerId: true, fullName: true },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const effective = effectiveDate ? new Date(effectiveDate) : new Date()
  if (Number.isNaN(effective.getTime())) {
    return NextResponse.json({ error: 'Invalid effective date' }, { status: 400 })
  }

  const created = await prisma.managerHistory.create({
    data: {
      employeeId: id,
      oldManagerId: employee.reportingManagerId,
      newManagerId: managerId === undefined ? employee.reportingManagerId : managerId,
      changedById: payload.userId,
      reason: reason?.trim() || notes?.trim() || null,
      title: title?.trim() || null,
      notes: notes?.trim() || null,
      effectiveDate: effective,
      isManual: true,
    },
  })

  if (shouldNotify) {
    await notify({
      employeeId: id,
      type: 'GENERAL',
      title: 'Your role history was updated',
      message: title
        ? `HR recorded a role change: ${title} (effective ${effective.toLocaleDateString('en-GB', { dateStyle: 'long' })}).`
        : 'HR added a new entry to your role history.',
      link: `/dashboard/employees/${id}?tab=lifecycle`,
    })
  }

  return NextResponse.json({ entry: created }, { status: 201 })
}
