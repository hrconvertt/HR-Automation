/**
 * PUT /api/payroll/payslips/[id]/adjust
 *
 *   HR-only, DRAFT-runs-only.
 *   Lets HR override line items on a single payslip:
 *     • bonus, leaveEncashment, otherAllowance (additions)
 *     • providentFund, otherDeductions (subtractions)
 *   Re-computes gross + net using the override values plus AutoPilot's
 *   pro-rated basic / allowances / OT / EOBI / income tax (those stay as-is).
 *
 *   Sets isAdjusted=true so the run's Recompute skips this row.
 *
 *   DELETE clears the adjustment and re-locks the row to AutoPilot
 *   (use "Unlock & Recompute" in the UI).
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

interface RouteParams { params: Promise<{ id: string }> }

async function getHrUser(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const me = await prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true, role: true } })
  if (!me || me.role !== 'HR_ADMIN') return { error: NextResponse.json({ error: 'HR Admin only' }, { status: 403 }) }
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return { error: NextResponse.json({ error: 'Switch back to HR view to edit payslips' }, { status: 403 }) }
  }
  return { me }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { me, error } = await getHrUser(request)
  if (error) return error
  const { id } = await params

  const body = await request.json()
  // Accept only the overridable line items + note.
  const num = (v: unknown) => {
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) && n >= 0 ? n : 0
  }
  const bonus            = num(body.bonus)
  const leaveEncashment  = num(body.leaveEncashment)
  const arrears          = num(body.arrears)
  const otherAllowance   = num(body.otherAllowance)
  const providentFund    = num(body.providentFund)
  const healthcare       = num(body.healthcare)
  const loanDeduction    = num(body.loanDeduction)
  const advanceDeduction = num(body.advanceDeduction)
  const otherDeductions  = num(body.otherDeductions)
  const adjustmentNote   = body.adjustmentNote ? String(body.adjustmentNote).trim().slice(0, 1000) : null

  const payslip = await prisma.payslip.findUnique({
    where: { id },
    include: { payrollRun: { select: { status: true } } },
  })
  if (!payslip) return NextResponse.json({ error: 'Payslip not found' }, { status: 404 })
  if (payslip.payrollRun && payslip.payrollRun.status !== 'DRAFT') {
    return NextResponse.json({ error: 'Payroll run is already finalized — adjustments must be made before approval.' }, { status: 409 })
  }

  // Recompute gross + net using the new overrides while keeping AutoPilot's
  // pro-rated basic / allowances / OT and the statutory deductions.
  const grossSalary =
    payslip.basic +
    payslip.houseRent +
    payslip.utilities +
    payslip.food +
    payslip.fuel +
    payslip.medicalAllowance +
    otherAllowance +
    payslip.overtimePay +
    bonus +
    leaveEncashment +
    arrears
  const netSalary =
    grossSalary -
    payslip.eobi -
    payslip.incomeTax -
    providentFund -
    healthcare -
    loanDeduction -
    advanceDeduction -
    otherDeductions

  const updated = await prisma.payslip.update({
    where: { id },
    data: {
      bonus,
      leaveEncashment,
      arrears,
      otherAllowance,
      providentFund,
      healthcare,
      loanDeduction,
      advanceDeduction,
      otherDeductions,
      grossSalary,
      netSalary,
      isAdjusted: true,
      adjustmentNote,
      adjustedBy: me!.id,
      adjustedAt: new Date(),
    },
  })

  // Bump run totals so the KPI cards stay accurate.
  if (payslip.payrollRunId) {
    const sums = await prisma.payslip.aggregate({
      where: { payrollRunId: payslip.payrollRunId },
      _sum: { grossSalary: true, netSalary: true, eobi: true, incomeTax: true },
    })
    await prisma.payrollRun.update({
      where: { id: payslip.payrollRunId },
      data: {
        totalGross: sums._sum.grossSalary ?? 0,
        totalNet:   sums._sum.netSalary ?? 0,
        totalEOBI:  sums._sum.eobi ?? 0,
        totalTax:   sums._sum.incomeTax ?? 0,
      },
    })
  }

  return NextResponse.json({ payslip: updated })
}

/**
 * Clear the adjustment so the next Recompute will re-derive this row
 * from AutoPilot's salary + attendance inputs.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { error } = await getHrUser(request)
  if (error) return error
  const { id } = await params

  const payslip = await prisma.payslip.findUnique({
    where: { id },
    include: { payrollRun: { select: { status: true } } },
  })
  if (!payslip) return NextResponse.json({ error: 'Payslip not found' }, { status: 404 })
  if (payslip.payrollRun && payslip.payrollRun.status !== 'DRAFT') {
    return NextResponse.json({ error: 'Cannot clear adjustment on a finalized run' }, { status: 409 })
  }

  await prisma.payslip.update({
    where: { id },
    data: { isAdjusted: false, adjustmentNote: null, adjustedBy: null, adjustedAt: null },
  })
  return NextResponse.json({ ok: true })
}
