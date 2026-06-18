import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

interface RouteParams { params: Promise<{ id: string }> }

/**
 * POST /api/employees/[id]/salary/history
 *
 * Backfill a historical CompensationHistory row WITHOUT touching the
 * current Salary record. Used by the "Add Historical Compensation Entry"
 * dialog when HR records past data (e.g. "in 2023 they were on 145K").
 *
 * Skips the "no changes" guard because the intent is past-data capture,
 * not a change. Still requires HR + a past effectiveDate.
 *
 * Optional `monthlyPayDay` is applied to the current Salary record (it's
 * a property of the live cycle, not of the historical row).
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
  try {
    const body = await request.json()
    const {
      basic, houseRent, utilities, food, fuel, medicalAllowance, otherAllowance,
      effectiveFrom, type, reason, monthlyPayDay,
    } = body

    if (!effectiveFrom) {
      return NextResponse.json({ error: 'Effective date is required' }, { status: 400 })
    }
    const effective = new Date(effectiveFrom)
    if (Number.isNaN(effective.getTime())) {
      return NextResponse.json({ error: 'Invalid effective date' }, { status: 400 })
    }
    if (effective > new Date()) {
      return NextResponse.json({ error: 'Historical entry date must be in the past' }, { status: 400 })
    }
    if (basic == null || basic < 0) {
      return NextResponse.json({ error: 'Basic salary is required' }, { status: 400 })
    }

    const newGross =
      basic + (houseRent ?? 0) + (utilities ?? 0) + (food ?? 0) +
      (fuel ?? 0) + (medicalAllowance ?? 0) + (otherAllowance ?? 0)

    // For a backfilled entry, infer "oldSalary" from the most recent
    // CompensationHistory row strictly BEFORE this date (or 0 if none).
    const prior = await prisma.compensationHistory.findFirst({
      where: { employeeId: id, effectiveDate: { lt: effective } },
      orderBy: { effectiveDate: 'desc' },
    })
    const oldGross = prior?.newSalary ?? 0
    const pct = oldGross > 0 ? ((newGross - oldGross) / oldGross) * 100 : null

    const history = await prisma.compensationHistory.create({
      data: {
        employeeId: id,
        type: type ?? 'ADJUSTMENT',
        oldSalary: oldGross,
        newSalary: newGross,
        incrementPct: pct,
        reason: reason?.trim() ? reason.trim() : 'Historical entry (backfill)',
        effectiveDate: effective,
        approvedById: payload.userId,
      },
    })

    // monthlyPayDay applies to the live Salary record — update if provided
    if (monthlyPayDay != null) {
      const payDay = Number(monthlyPayDay)
      if (Number.isFinite(payDay) && payDay >= 1 && payDay <= 31) {
        const existing = await prisma.salary.findUnique({ where: { employeeId: id } })
        if (existing) {
          await prisma.salary.update({
            where: { employeeId: id },
            data: { monthlyPayDay: payDay },
          })
        }
      }
    }

    return NextResponse.json({ history })
  } catch (err) {
    console.error('[POST /api/employees/[id]/salary/history]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
