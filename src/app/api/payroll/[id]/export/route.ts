/**
 * Multi-format bank-batch export.
 *
 *   GET /api/payroll/[id]/export?format=IFT|IBFT|BOTH
 *
 *   - IFT  : Faysal Bank only (account IBANs starting PK<dd>FAYS)
 *            Columns: Beneficiary First Name | Beneficiary Account No |
 *                     Transaction Amount | Reference # 1 | Reference # 9 | Note
 *   - IBFT : All other (non-Faysal) banks
 *            Columns: Beneficiary First Name | Beneficiary Account No | Bank |
 *                     Transaction Amount | Reference # 1 | Reference # 9 | Notes
 *   - BOTH : One xlsx, two sheets ("IFT", "IBFT")
 *
 * Filename: Paid_<format>_<MonthShort>_<Year>.xlsx
 *
 * Auth: HR_ADMIN, FINANCE, or EXECUTIVE (CEO needs the file to verify).
 * Allowed statuses: PENDING_CEO and later (anything past DRAFT).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { bankCodeFromIban, isFaysalIban } from '@/lib/bank-codes'
import * as XLSX from 'xlsx'

interface RouteParams { params: Promise<{ id: string }> }

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']

export async function GET(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { userRoles: { select: { role: true } } },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userRoles = user.userRoles.length ? user.userRoles.map((r) => r.role) : [user.role]
  if (!userRoles.some((r) => ['HR_ADMIN', 'FINANCE', 'EXECUTIVE'].includes(r))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const url = new URL(request.url)
  const formatParam = (url.searchParams.get('format') ?? 'BOTH').toUpperCase()
  const format = formatParam === 'IFT' || formatParam === 'IBFT' ? formatParam : 'BOTH'

  const run = await prisma.payrollRun.findUnique({
    where: { id },
    include: {
      payslips: {
        include: {
          employee: {
            select: { fullName: true, ibanAccount: true, bankAccount: true, bankName: true, bankCode: true },
          },
        },
      },
    },
  })
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Allow export at any post-draft stage (HR/CEO/Finance all need the preview)
  if (run.status === 'DRAFT') {
    return NextResponse.json(
      { error: 'Export not available while the run is still a DRAFT' },
      { status: 400 },
    )
  }

  const monthShort = MONTHS_SHORT[run.month - 1]
  const monthFull = MONTHS_FULL[run.month - 1]
  const reference = `Salary ${monthFull} ${run.year}`

  // Partition rows by bank
  const faysal: Record<string, string | number>[] = []
  const other: Record<string, string | number>[] = []

  for (const p of run.payslips) {
    const iban = p.employee.ibanAccount ?? p.employee.bankAccount ?? ''
    const amount = Number((p.transactionAmount ?? p.netSalary).toFixed(2))
    const note = p.payoutNotes ?? p.adjustmentNote ?? ''

    if (isFaysalIban(iban)) {
      // IFT row — bank column is implicit
      faysal.push({
        'Beneficiary First Name': p.employee.fullName,
        'Beneficiary Account No': iban,
        'Transaction Amount': amount,
        'Reference # 1': reference,
        'Reference # 9': reference,
        'Note': note,
      })
    } else {
      other.push({
        'Beneficiary First Name': p.employee.fullName,
        'Beneficiary Account No': iban,
        'Bank': p.employee.bankCode || bankCodeFromIban(iban) || (p.employee.bankName ?? ''),
        'Transaction Amount': amount,
        'Reference # 1': reference,
        'Reference # 9': reference,
        'Notes': note,
      })
    }
  }

  const wb = XLSX.utils.book_new()

  function addIftSheet() {
    const ws = XLSX.utils.json_to_sheet(faysal, {
      header: [
        'Beneficiary First Name',
        'Beneficiary Account No',
        'Transaction Amount',
        'Reference # 1',
        'Reference # 9',
        'Note',
      ],
    })
    ws['!cols'] = [{ wch: 28 }, { wch: 28 }, { wch: 16 }, { wch: 22 }, { wch: 22 }, { wch: 30 }]
    XLSX.utils.book_append_sheet(wb, ws, 'IFT')
  }

  function addIbftSheet() {
    const ws = XLSX.utils.json_to_sheet(other, {
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
    ws['!cols'] = [{ wch: 28 }, { wch: 28 }, { wch: 12 }, { wch: 16 }, { wch: 22 }, { wch: 22 }, { wch: 30 }]
    XLSX.utils.book_append_sheet(wb, ws, 'IBFT')
  }

  if (format === 'IFT') addIftSheet()
  else if (format === 'IBFT') addIbftSheet()
  else { addIftSheet(); addIbftSheet() }

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const tag = format === 'BOTH' ? 'Combined' : format
  const filename = `Paid_${tag}_${monthShort}_${run.year}.xlsx`

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
