/**
 * GET /api/payroll/retro-suggestions?month=&year=
 *
 * Detects employees owed retroactive salary (arrears): a compensation raise
 * whose effectiveDate falls in a PRIOR month, where that prior month already
 * has a PAID regular payslip computed at the OLD (lower) gross. The employee
 * was underpaid for the months between the effective date and now.
 *
 *   arrears = (currentBaselineGross - paidGross) summed across each affected
 *             prior month that was paid low.
 *
 * We derive the "current baseline gross" from the employee's current Salary
 * row (sum of all components) — the same figure a fresh generate would use.
 * A CompensationHistory row (raise) supplies the effectiveDate + confirms a
 * change occurred; the paid-vs-baseline gap is the source of truth for the
 * amount, so this works even if history.newSalary only tracks basic.
 *
 * Role: HR_ADMIN only (salary amounts). Blocked while previewing.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { YTD_FINAL_STATUSES } from '@/lib/payroll-ytd'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// Absolute month index so month/year arithmetic is easy.
const idx = (m: number, y: number) => y * 12 + (m - 1)

export interface RetroSuggestion {
  employeeId: string
  name: string
  employeeCode: string
  months: string[]          // e.g. ["May 2026", "Jun 2026"]
  totalArrears: number
  currentGross: number
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const month = Number(searchParams.get('month'))
  const year = Number(searchParams.get('year'))
  if (!month || !year || month < 1 || month > 12) {
    return NextResponse.json({ error: 'month and year are required' }, { status: 400 })
  }

  const currentIdx = idx(month, year)

  // Comp raises effective STRICTLY before the current period.
  const raises = await prisma.compensationHistory.findMany({
    where: { newSalary: { gt: 0 } },
    orderBy: { effectiveDate: 'asc' },
    select: { employeeId: true, effectiveDate: true, oldSalary: true, newSalary: true },
  })

  // Latest raise per employee whose effectiveDate is in a prior month.
  const latestRaise = new Map<string, { effIdx: number; effMonth: number; effYear: number }>()
  for (const r of raises) {
    const em = r.effectiveDate.getMonth() + 1
    const ey = r.effectiveDate.getFullYear()
    const ei = idx(em, ey)
    if (ei >= currentIdx) continue // effective this month or later — not retroactive
    // keep the most recent prior raise
    const prev = latestRaise.get(r.employeeId)
    if (!prev || ei > prev.effIdx) latestRaise.set(r.employeeId, { effIdx: ei, effMonth: em, effYear: ey })
  }

  if (latestRaise.size === 0) return NextResponse.json({ suggestions: [] })

  const empIds = [...latestRaise.keys()]

  const employees = await prisma.employee.findMany({
    where: { id: { in: empIds }, status: 'ACTIVE' },
    select: {
      id: true, fullName: true, employeeCode: true,
      salary: {
        select: {
          basic: true, houseRent: true, utilities: true, food: true,
          fuel: true, medicalAllowance: true, otherAllowance: true,
        },
      },
    },
  })

  // Prior PAID regular payslips for these employees, from the effective month up
  // to (but not including) the current period.
  const paidSlips = await prisma.payslip.findMany({
    where: {
      employeeId: { in: empIds },
      status: { in: YTD_FINAL_STATUSES },
      payrollRun: { runType: 'REGULAR' },
    },
    select: { employeeId: true, month: true, year: true, grossSalary: true },
  })
  const slipsByEmp = new Map<string, typeof paidSlips>()
  for (const s of paidSlips) {
    const arr = slipsByEmp.get(s.employeeId) ?? []
    arr.push(s)
    slipsByEmp.set(s.employeeId, arr)
  }

  const suggestions: RetroSuggestion[] = []

  for (const emp of employees) {
    if (!emp.salary) continue
    const raise = latestRaise.get(emp.id)!
    const s = emp.salary
    const currentGross =
      s.basic + s.houseRent + s.utilities + s.food + s.fuel + s.medicalAllowance + s.otherAllowance
    if (currentGross <= 0) continue

    const months: string[] = []
    let total = 0
    for (const slip of slipsByEmp.get(emp.id) ?? []) {
      const si = idx(slip.month, slip.year)
      // Paid month must be at/after the raise took effect, and before now.
      if (si < raise.effIdx || si >= currentIdx) continue
      const gap = currentGross - slip.grossSalary
      // Only count months paid BELOW the current baseline (underpaid).
      // Use a small tolerance so rounding noise isn't flagged.
      if (gap > 1) {
        total += gap
        months.push(`${MONTHS[slip.month - 1]} ${slip.year}`)
      }
    }

    if (total > 0 && months.length > 0) {
      suggestions.push({
        employeeId: emp.id,
        name: emp.fullName,
        employeeCode: emp.employeeCode,
        months,
        totalArrears: Math.round(total),
        currentGross: Math.round(currentGross),
      })
    }
  }

  suggestions.sort((a, b) => b.totalArrears - a.totalArrears)
  return NextResponse.json({ suggestions })
}
