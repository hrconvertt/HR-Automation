/**
 * Per-entry CRUD for CompensationHistory rows.
 *
 *   PATCH  — HR_ADMIN only. Partial update of effectiveDate / type /
 *            oldSalary / newSalary / reason. Auto-recomputes incrementPct.
 *   DELETE — HR_ADMIN only. Hard-removes the entry. Writes an AuditLog row.
 *
 * Preview mode (hr_preview_role cookie set to anything other than HR_ADMIN)
 * is blocked — HR must switch back to their real view before mutating
 * compensation data.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

interface RouteParams { params: Promise<{ id: string }> }

async function requireHR(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!hasRole(payload, 'HR_ADMIN')) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return { error: NextResponse.json({ error: 'Switch back to HR view to edit compensation' }, { status: 403 }) }
  }
  return { payload }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await requireHR(request)
  if (auth.error) return auth.error
  const { id } = await params

  try {
    const body = await request.json()
    const { effectiveDate, type, oldSalary, newSalary, reason } = body as {
      effectiveDate?: string
      type?: string
      oldSalary?: number
      newSalary?: number
      reason?: string | null
    }

    const existing = await prisma.compensationHistory.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Resolve effective values (use new ones if present, else fall back)
    const finalOld = oldSalary != null ? oldSalary : existing.oldSalary
    const finalNew = newSalary != null ? newSalary : existing.newSalary
    if (finalNew < 0 || finalOld < 0) {
      return NextResponse.json({ error: 'Salary values must be non-negative' }, { status: 400 })
    }

    // Recompute incrementPct from final old/new values.
    const finalPct = finalOld > 0 ? ((finalNew - finalOld) / finalOld) * 100 : null

    const updated = await prisma.compensationHistory.update({
      where: { id },
      data: {
        ...(effectiveDate ? { effectiveDate: new Date(effectiveDate) } : {}),
        ...(type ? { type } : {}),
        ...(oldSalary != null ? { oldSalary } : {}),
        ...(newSalary != null ? { newSalary } : {}),
        ...(reason !== undefined ? { reason: reason ?? null } : {}),
        incrementPct: finalPct,
      },
    })

    // Audit trail
    try {
      await prisma.auditLog.create({
        data: {
          userId: auth.payload!.userId,
          employeeId: existing.employeeId,
          action: 'UPDATE',
          entity: 'CompensationHistory',
          entityId: id,
          oldValue: JSON.stringify({
            effectiveDate: existing.effectiveDate,
            type: existing.type,
            oldSalary: existing.oldSalary,
            newSalary: existing.newSalary,
            incrementPct: existing.incrementPct,
            reason: existing.reason,
          }),
          newValue: JSON.stringify({
            effectiveDate: updated.effectiveDate,
            type: updated.type,
            oldSalary: updated.oldSalary,
            newSalary: updated.newSalary,
            incrementPct: updated.incrementPct,
            reason: updated.reason,
          }),
        },
      })
    } catch (auditErr) {
      // Audit failures must not block the user — log and continue.
      console.error('[audit] CompensationHistory PATCH', auditErr)
    }

    return NextResponse.json({ entry: updated })
  } catch (err) {
    console.error('[PATCH /api/compensation/history/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await requireHR(request)
  if (auth.error) return auth.error
  const { id } = await params

  try {
    const existing = await prisma.compensationHistory.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await prisma.compensationHistory.delete({ where: { id } })

    try {
      await prisma.auditLog.create({
        data: {
          userId: auth.payload!.userId,
          employeeId: existing.employeeId,
          action: 'DELETE',
          entity: 'CompensationHistory',
          entityId: id,
          oldValue: JSON.stringify(existing),
        },
      })
    } catch (auditErr) {
      console.error('[audit] CompensationHistory DELETE', auditErr)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/compensation/history/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
