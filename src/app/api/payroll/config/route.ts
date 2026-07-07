/**
 * Payroll calendar config — the 3 day-of-month ints surfaced on the HR
 * payroll view's calendar card.
 *
 *   GET   → { payrollCutoffDay, payrollReviewDays, payrollDisburseDay }
 *   PATCH → same body; HR_ADMIN only. Values clamped to sane ranges.
 *
 * Role: GET is any authenticated user (values are non-sensitive scheduling
 * info); PATCH is HR_ADMIN only and blocked while previewing another role.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, hasRole } from '@/lib/auth'
import { getPayrollConfig, savePayrollConfig } from '@/lib/config'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cfg = await getPayrollConfig()
  return NextResponse.json({
    payrollCutoffDay: cfg.payrollCutoffDay,
    payrollReviewDays: cfg.payrollReviewDays,
    payrollDisburseDay: cfg.payrollDisburseDay,
  })
}

const clampDay = (v: unknown, fallback: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(31, Math.max(1, n)) : fallback
}

export async function PATCH(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to edit the payroll calendar' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const current = await getPayrollConfig()
  const updates = {
    payrollCutoffDay: clampDay(body.payrollCutoffDay, current.payrollCutoffDay),
    // review window is a number of days, not a day-of-month
    payrollReviewDays: Math.min(30, Math.max(0, Math.round(Number(body.payrollReviewDays)) || current.payrollReviewDays)),
    payrollDisburseDay: clampDay(body.payrollDisburseDay, current.payrollDisburseDay),
  }
  await savePayrollConfig(updates)
  return NextResponse.json(updates)
}
