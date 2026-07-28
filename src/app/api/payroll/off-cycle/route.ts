import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

/**
 * POST /api/payroll/off-cycle — Workday "on-demand payment" runs.
 *
 * Body: {
 *   month, year,
 *   runType: 'BONUS' | 'ARREARS' | 'FINAL_SETTLEMENT',
 *   entries: [{ employeeId, amount, note? }]
 * }
 *
 * Skips the auto-generate compute entirely — HR enters amounts directly
 * (editable afterwards in the grid). Multiple off-cycle runs per month are
 * allowed; the run follows the same DRAFT → … → PAID approval pipeline.
 *
 * Role: HR_ADMIN only.
 */

const OFF_CYCLE_TYPES = ['BONUS', 'ARREARS', 'FINAL_SETTLEMENT'] as const
type OffCycleType = (typeof OFF_CYCLE_TYPES)[number]

const TYPE_LABEL: Record<OffCycleType, string> = {
  BONUS: 'Bonus',
  ARREARS: 'Arrears',
  FINAL_SETTLEMENT: 'Final Settlement',
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to create off-cycle runs' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const month = Number(body.month)
    const year = Number(body.year)
    const runType = String(body.runType ?? '') as OffCycleType
    const entries: Array<{ employeeId?: string; amount?: number; note?: string }> =
      Array.isArray(body.entries) ? body.entries : []

    if (!month || !year || month < 1 || month > 12) {
      return NextResponse.json({ error: 'month and year are required' }, { status: 400 })
    }
    if (!OFF_CYCLE_TYPES.includes(runType)) {
      return NextResponse.json(
        { error: `runType must be one of ${OFF_CYCLE_TYPES.join(', ')}` },
        { status: 400 },
      )
    }
    const cleaned = entries
      .map((e) => ({
        employeeId: String(e.employeeId ?? ''),
        amount: Number(e.amount),
        note: typeof e.note === 'string' ? e.note.slice(0, 200) : null,
      }))
      .filter((e) => e.employeeId && Number.isFinite(e.amount) && e.amount > 0)
    if (cleaned.length === 0) {
      return NextResponse.json(
        { error: 'At least one employee with a positive amount is required' },
        { status: 400 },
      )
    }
    // De-dupe employees (one payslip per employee per run)
    const byEmp = new Map(cleaned.map((e) => [e.employeeId, e]))

    const employees = await prisma.employee.findMany({
      where: { id: { in: [...byEmp.keys()] } },
      select: { id: true },
    })
    if (employees.length !== byEmp.size) {
      return NextResponse.json({ error: 'One or more employees not found' }, { status: 400 })
    }

    const label = TYPE_LABEL[runType]
    const reference = `${label} ${MONTHS[month - 1]} ${year}`

    const payslipsData = [...byEmp.values()].map((e) => ({
      employeeId: e.employeeId,
      month,
      year,
      basic: 0,
      // Route the amount to the semantically matching component so the
      // register / GL grouping stays truthful.
      bonus: runType === 'BONUS' ? e.amount : 0,
      arrears: runType === 'ARREARS' ? e.amount : 0,
      otherAllowance: runType === 'FINAL_SETTLEMENT' ? e.amount : 0,
      grossSalary: e.amount,
      eobi: 0,
      incomeTax: 0,
      otherDeductions: 0,
      netSalary: e.amount,
      transactionAmount: e.amount,
      workingDays: 0,
      presentDays: 0,
      status: 'DRAFT',
      reference,
      adjustmentNote: e.note ?? undefined,
      isAdjusted: true, // amounts are manual — Recompute must never overwrite
    }))

    const totalAmount = payslipsData.reduce((s, p) => s + p.netSalary, 0)

    const run = await prisma.payrollRun.create({
      data: {
        month,
        year,
        status: 'DRAFT',
        runType,
        totalGross: totalAmount,
        totalNet: totalAmount,
        totalEOBI: 0,
        totalTax: 0,
        payslips: { create: payslipsData },
      },
      select: { id: true },
    })

    return NextResponse.json(
      { payrollRun: { id: run.id, month, year, runType }, count: payslipsData.length },
      { status: 201 },
    )
  } catch (err) {
    console.error('[POST /api/payroll/off-cycle]', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: `Off-cycle run creation failed: ${msg.slice(0, 400)}` },
      { status: 500 },
    )
  }
}
