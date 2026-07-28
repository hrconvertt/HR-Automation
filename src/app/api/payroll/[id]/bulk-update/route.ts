/**
 * Bulk-update endpoint for the spreadsheet grid editor.
 *
 *   POST /api/payroll/[id]/bulk-update
 *   Body: { updates: [{ payslipId, ...fields }, ...] }
 *
 * Applies all edits in a single transaction. Role gating:
 *   - HR_ADMIN (DRAFT or PENDING_HR_FINAL): may edit amounts + status + notes + IBAN
 *   - EXECUTIVE (PENDING_CEO): may only edit payoutNotes
 *   - FINANCE (PENDING_FINANCE): may only edit Payslip.status (Pending/On Hold/Paid)
 *
 * Returns the freshly-loaded run (same shape as GET /api/payroll) so the
 * client can rehydrate.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

interface RouteParams { params: Promise<{ id: string }> }

type UpdateField =
  | 'grossSalary'
  | 'otherDeductions'
  | 'overtimePay'
  | 'lateDeduction'
  | 'arrears'
  | 'transactionAmount'
  | 'netSalary'
  | 'payoutNotes'
  | 'status'
  | 'ibanAccount'   // employee-level field (allowed for HR)

interface RowUpdate {
  payslipId: string
  [key: string]: unknown
}

const NUMERIC_FIELDS = new Set<UpdateField>([
  'grossSalary',
  'otherDeductions',
  'overtimePay',
  'lateDeduction',
  'arrears',
  'transactionAmount',
  'netSalary',
])

const HR_ALLOWED_FIELDS = new Set<UpdateField>([
  'grossSalary', 'otherDeductions', 'overtimePay', 'lateDeduction', 'arrears',
  'transactionAmount', 'netSalary', 'payoutNotes', 'status', 'ibanAccount',
])
const CEO_ALLOWED_FIELDS = new Set<UpdateField>(['payoutNotes'])
const FINANCE_ALLOWED_FIELDS = new Set<UpdateField>(['status', 'payoutNotes'])

export async function POST(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Block edits while previewing a different role
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== payload.role) {
    return NextResponse.json({ error: 'Switch back to your primary role to save' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const updates = (body.updates as RowUpdate[] | undefined) ?? []
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: {
      userRoles: { select: { role: true } },
      employee: { select: { fullName: true } },
    },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userRoles = user.userRoles.length ? user.userRoles.map((r) => r.role) : [user.role]

  const run = await prisma.payrollRun.findUnique({ where: { id } })
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Decide which field-set this user is allowed to write based on stage + role.
  let allowed: Set<UpdateField> | null = null
  if (run.status === 'DRAFT' || run.status === 'PENDING_HR_FINAL') {
    if (userRoles.includes('HR_ADMIN')) allowed = HR_ALLOWED_FIELDS
  } else if (run.status === 'PENDING_CEO') {
    if (userRoles.includes('EXECUTIVE') || userRoles.includes('HR_ADMIN')) allowed = CEO_ALLOWED_FIELDS
  } else if (run.status === 'PENDING_FINANCE') {
    if (userRoles.includes('FINANCE') || userRoles.includes('HR_ADMIN')) allowed = FINANCE_ALLOWED_FIELDS
  }
  if (!allowed) {
    return NextResponse.json({ error: `Cannot edit at status "${run.status}"` }, { status: 403 })
  }

  // Validate + collect changes
  const payslipIds = updates.map((u) => u.payslipId).filter(Boolean)
  const existing = await prisma.payslip.findMany({
    where: { id: { in: payslipIds }, payrollRunId: id },
    select: { id: true, employeeId: true },
  })
  const validIds = new Set(existing.map((p) => p.id))
  const empByPayslip = new Map(existing.map((p) => [p.id, p.employeeId]))

  const now = new Date()
  try {
    await prisma.$transaction(async (tx) => {
      for (const u of updates) {
        if (!validIds.has(u.payslipId)) continue

        const payslipData: Record<string, unknown> = {}
        let employeeIban: string | null | undefined = undefined

        for (const [k, raw] of Object.entries(u)) {
          if (k === 'payslipId') continue
          const key = k as UpdateField
          if (!allowed.has(key)) continue

          if (key === 'ibanAccount') {
            employeeIban = typeof raw === 'string' ? raw.trim() || null : null
            continue
          }
          if (NUMERIC_FIELDS.has(key)) {
            const n = raw === '' || raw === null ? null : Number(raw)
            if (n !== null && !Number.isFinite(n)) continue
            // transactionAmount is nullable; others stored as-is
            payslipData[key] = n
            continue
          }
          if (key === 'status') {
            const s = String(raw ?? '').trim()
            if (!['PENDING', 'ON_HOLD', 'PAID', 'DRAFT'].includes(s)) continue
            payslipData[key] = s
            continue
          }
          if (key === 'payoutNotes') {
            payslipData[key] = typeof raw === 'string' ? raw : null
            continue
          }
        }

        if (Object.keys(payslipData).length > 0) {
          // Mark as HR-adjusted so recompute doesn't wipe overrides
          if (userRoles.includes('HR_ADMIN') && run.status === 'DRAFT') {
            payslipData.isAdjusted = true
            payslipData.adjustedBy = payload.userId
            payslipData.adjustedAt = now
          }
          await tx.payslip.update({ where: { id: u.payslipId }, data: payslipData })
        }
        if (employeeIban !== undefined) {
          const empId = empByPayslip.get(u.payslipId)
          if (empId) {
            await tx.employee.update({ where: { id: empId }, data: { ibanAccount: employeeIban } })
          }
        }
      }

      // Recompute run totals from current payslips
      const slips = await tx.payslip.findMany({
        where: { payrollRunId: id },
        select: { grossSalary: true, netSalary: true, eobi: true, incomeTax: true },
      })
      const totals = slips.reduce(
        (a, p) => ({
          totalGross: a.totalGross + (p.grossSalary ?? 0),
          totalNet: a.totalNet + (p.netSalary ?? 0),
          totalEOBI: a.totalEOBI + (p.eobi ?? 0),
          totalTax: a.totalTax + (p.incomeTax ?? 0),
        }),
        { totalGross: 0, totalNet: 0, totalEOBI: 0, totalTax: 0 },
      )
      await tx.payrollRun.update({ where: { id }, data: totals })
    })
  } catch (err) {
    console.error('[bulk-update] failed:', err)
    return NextResponse.json({ error: 'Bulk update failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true, count: updates.length })
}
