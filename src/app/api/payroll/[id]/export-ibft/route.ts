/**
 * IBFT / IFT bank-batch export.
 *
 * Generates an xlsx in the format the bank's bulk-transfer portal accepts
 * (matches the `Paid_IBFT Account Details` reference template):
 *
 *   Beneficiary First Name | Beneficiary Account No | Bank
 *   | Transaction Amount  | Reference # 1 | Reference # 9 | Notes
 *
 * Finance downloads this and uploads it to the bank — one click per payroll.
 *
 * Auth: FINANCE or HR_ADMIN. The run must be PENDING_FINANCE or PAID.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import * as XLSX from 'xlsx'

interface RouteParams { params: Promise<{ id: string }> }

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export async function GET(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { userRoles: { select: { role: true } } },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userRoles = user.userRoles.length ? user.userRoles.map((r) => r.role) : [user.role]
  if (!userRoles.some((r) => ['FINANCE', 'HR_ADMIN'].includes(r))) {
    return NextResponse.json({ error: 'Forbidden — FINANCE or HR only' }, { status: 403 })
  }

  const { id } = await params
  const run = await prisma.payrollRun.findUnique({
    where: { id },
    include: {
      payslips: {
        include: {
          employee: {
            select: {
              fullName: true,
              ibanAccount: true,
              bankAccount: true,
              bankName: true,
            },
          },
        },
      },
    },
  })
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Allow export from PENDING_FINANCE (so Finance can preview) and PAID.
  // Also tolerate legacy statuses (APPROVED/LOCKED/DISBURSED/CLOSED).
  const allowedStatuses = new Set([
    'PENDING_FINANCE', 'PAID',
    'APPROVED', 'LOCKED', 'DISBURSED', 'CLOSED',
  ])
  if (!allowedStatuses.has(run.status)) {
    return NextResponse.json(
      { error: `IBFT export not available at status "${run.status}"` },
      { status: 400 },
    )
  }

  const monthShort = MONTHS_SHORT[run.month - 1]
  const reference = `Salary ${monthShort} ${run.year}`

  const rows = run.payslips.map((p) => ({
    'Beneficiary First Name': p.employee.fullName,
    'Beneficiary Account No': p.employee.ibanAccount ?? p.employee.bankAccount ?? '',
    'Bank': p.employee.bankName ?? '',
    'Transaction Amount': Number(p.netSalary.toFixed(2)),
    'Reference # 1': reference,
    'Reference # 9': reference,
    'Notes': p.adjustmentNote ?? '',
  }))

  // Build the workbook
  const ws = XLSX.utils.json_to_sheet(rows, {
    header: [
      'Beneficiary First Name',
      'Beneficiary Account No',
      'Bank',
      'Transaction Amount',
      'Reference # 1',
      'Reference # 9',
      'Notes',
    ],
  })
  // Column widths so it opens cleanly
  ws['!cols'] = [
    { wch: 28 }, { wch: 28 }, { wch: 22 }, { wch: 16 },
    { wch: 22 }, { wch: 22 }, { wch: 30 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'IBFT')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  const filename = `IBFT_${monthShort}_${run.year}.xlsx`
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
