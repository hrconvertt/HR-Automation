import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { notify } from '@/lib/notifications'

interface RouteParams { params: Promise<{ id: string; entryId: string }> }

/**
 * PATCH /api/employees/[id]/role-history/[entryId]
 *
 * HR-only edit of a single role-history row.
 *
 * Body: any of { title, managerId, effectiveDate, notes, reason, notify }
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view' }, { status: 403 })
  }

  const { id, entryId } = await params
  const body = await request.json().catch(() => ({}))
  const {
    title, managerId, effectiveDate, notes, reason, notify: shouldNotify,
  } = body as {
    title?: string | null
    managerId?: string | null
    effectiveDate?: string | null
    notes?: string | null
    reason?: string | null
    notify?: boolean
  }

  const existing = await prisma.managerHistory.findUnique({ where: { id: entryId } })
  if (!existing || existing.employeeId !== id) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  }

  const data: Record<string, unknown> = {}
  if (title !== undefined) data.title = title?.trim() || null
  if (managerId !== undefined) data.newManagerId = managerId
  if (notes !== undefined) data.notes = notes?.trim() || null
  if (reason !== undefined) data.reason = reason?.trim() || null
  if (effectiveDate !== undefined) {
    if (effectiveDate === null) {
      data.effectiveDate = null
    } else {
      const d = new Date(effectiveDate)
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: 'Invalid effective date' }, { status: 400 })
      }
      data.effectiveDate = d
    }
  }

  const updated = await prisma.managerHistory.update({
    where: { id: entryId },
    data,
  })

  if (shouldNotify) {
    await notify({
      employeeId: id,
      type: 'GENERAL',
      title: 'Your role history was updated',
      message: 'HR updated an entry in your role history.',
      link: `/dashboard/employees/${id}?tab=lifecycle`,
    })
  }

  return NextResponse.json({ entry: updated })
}

/**
 * DELETE /api/employees/[id]/role-history/[entryId]
 *
 * Remove an erroneous role-history row. HR-only.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view' }, { status: 403 })
  }

  const { id, entryId } = await params
  const existing = await prisma.managerHistory.findUnique({ where: { id: entryId } })
  if (!existing || existing.employeeId !== id) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  }

  await prisma.managerHistory.delete({ where: { id: entryId } })
  return NextResponse.json({ ok: true })
}
