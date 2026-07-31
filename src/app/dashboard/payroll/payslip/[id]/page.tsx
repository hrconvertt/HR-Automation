import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { ArrowLeft, Printer } from 'lucide-react'

interface PageProps { params: Promise<{ id: string }> }

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

/**
 * Salary slip — a faithful reproduction of the issued Convertt slip
 * (Word original: "<Employee> - Salary Slip _ Month of <Mon> <YY>.docx").
 *
 * THIS LAYOUT IS FIXED. One bordered table: blue title band, the two-column
 * employee block, the leave grid, then the Pay & Allowances / Deductions grid
 * in exactly the row order below — including the blank filler rows, which keep
 * "Gross Salary" aligned against "Other Deductions" as in the original.
 * Employees and Finance compare this against the Word slip line by line, so a
 * tidier arrangement is a defect, not an improvement.
 */
export default async function PayslipPage({ params }: PageProps) {
  const { id } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true, reportingManagerId: true } } },
  })
  if (!user) redirect('/login')

  const previewRole = cookieStore.get('hr_preview_role')?.value
  const effectiveRole = previewRole && payload.roles.includes(previewRole) ? previewRole : user.role
  const isHR = effectiveRole === 'HR_ADMIN'

  const slip = await prisma.payslip.findUnique({
    where: { id },
    include: {
      employee: { include: { department: true, salary: true } },
      payrollRun: true,
    },
  })
  if (!slip) notFound()

  const isOwn = slip.employeeId === user.employee?.id
  const isMyTeamMember = slip.employee.reportingManagerId === user.employee?.id
  if (!isHR && !isOwn && !isMyTeamMember && effectiveRole !== 'EXECUTIVE') {
    return (
      <div className="p-6 bg-slate-50 border border-slate-100 rounded-2xl">
        <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="text-sm text-slate-900 mt-2">You can only view your own payslip.</p>
      </div>
    )
  }

  // Leave grid — Casual / Sick / Annual for the slip's year.
  const balances = await prisma.leaveBalance.findMany({
    where: {
      employeeId: slip.employeeId,
      year: slip.year,
      leaveType: { in: ['CASUAL', 'SICK', 'ANNUAL'] },
    },
    select: { leaveType: true, allocated: true, used: true, remaining: true },
  })
  const leaveRow = (type: string) => balances.find((b) => b.leaveType === type)

  const e = slip.employee
  const monthName = MONTHS[slip.month] ?? ''

  // Earnings print their figure (including 0); nil deductions and nil leave
  // print an en dash — exactly as the Word slip does.
  const amt = (n: number) => n.toLocaleString('en-PK', { maximumFractionDigits: 0 })
  const ded = (n: number) => (n ? amt(n) : '–')
  const lv = (n: number | undefined | null) => (n === undefined || n === null || n === 0 ? '–' : String(n))

  const grossSalary = slip.basic + slip.houseRent + slip.utilities
  const totalPayments =
    slip.basic + slip.houseRent + slip.utilities + slip.food + slip.fuel +
    slip.overtimePay + slip.bonus + slip.arrears + slip.otherAllowance + slip.medicalAllowance
  const loanVehicle = slip.loanDeduction
  const totalDeduction =
    slip.incomeTax + slip.eobi + slip.healthcare + loanVehicle +
    slip.advanceDeduction + slip.otherDeductions
  const netPay = totalPayments - totalDeduction

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href="/dashboard/payroll" className="inline-flex items-center gap-1 text-sm text-slate-700 hover:underline">
          <ArrowLeft className="w-4 h-4" /> Back to Payroll
        </Link>
        <PrintButton />
      </div>

      <div className="slip-sheet bg-white mx-auto">
        {/* ── Letterhead ─────────────────────────────────────────── */}
        <div className="slip-head">
          <div className="slip-brand">
            <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
              <path d="M4 6h11v5H9v10h6v5H4z" fill="#8CC63F" />
              <path d="M17 6h4v20h-4z" fill="#8CC63F" />
            </svg>
            <span className="slip-wordmark">Convertt</span>
          </div>
          <div>Convertt Ltd (Generatives)</div>
          <div>Office 201, 5th Floor, Mega Tower, Gulberg Main Blvd, Lahore</div>
          <div><a href="mailto:finance@convertt.co" className="slip-mail">finance@convertt.co</a></div>
          <div>+92 370 0488685</div>
        </div>

        {/* ── The slip table ─────────────────────────────────────── */}
        <table className="slip">
          <tbody>
            <tr><td colSpan={4} className="band">Salary Slip</td></tr>

            <tr>
              <td colSpan={2}>
                <div><b>Employee Number:</b> {e.employeeCode}</div>
                <div className="spacer" />
                <div><b>DOJ:</b> {e.joiningDate ? e.joiningDate.toLocaleDateString('en-GB') : '—'}</div>
                <div><b>Location:</b> {e.workLocationAddress || 'Head Office'}</div>
                <div><b>Account Number:</b> {e.ibanAccount || e.bankAccount || '—'}</div>
                <div><b>CNIC:</b> {e.cnic || '—'}</div>
              </td>
              <td colSpan={2}>
                <div><b>Employee Name:</b> {e.fullName}</div>
                <div><b>Designation:</b> {e.designation}</div>
                <div className="spacer" />
                <div><b>Salary Month:</b> {monthName} {slip.year}</div>
                <div><b>Bank/Branch:</b> {e.bankName || '—'}</div>
                <div><b>Total Working Days:</b> {slip.workingDays}</div>
              </td>
            </tr>

            <tr>
              <td><b>Leave Details</b></td>
              <td className="center"><b>Entitled</b></td>
              <td className="center"><b>Availed</b></td>
              <td className="center"><b>Remaining</b></td>
            </tr>
            {(['CASUAL', 'SICK', 'ANNUAL'] as const).map((t) => {
              const b = leaveRow(t)
              return (
                <tr key={t}>
                  <td><b>{t.charAt(0) + t.slice(1).toLowerCase()}</b></td>
                  <td className="center">{lv(b?.allocated)}</td>
                  <td className="center">{lv(b?.used)}</td>
                  <td className="center">{lv(b?.remaining)}</td>
                </tr>
              )
            })}

            <tr>
              <td><b>Pay &amp; Allowances</b></td>
              <td className="center"><b>Rs.</b></td>
              <td><b>Deductions</b></td>
              <td className="center"><b>Rs.</b></td>
            </tr>

            <tr>
              <td>Basic Salary</td>
              <td className="center">{amt(slip.basic)}</td>
              <td>Income tax</td>
              <td className="center">{ded(slip.incomeTax)}</td>
            </tr>
            <tr>
              <td>House Rent</td>
              <td className="center">{amt(slip.houseRent)}</td>
              <td>EOBI</td>
              <td className="center">{ded(slip.eobi)}</td>
            </tr>
            <tr>
              <td>Utilities</td>
              <td className="center">{amt(slip.utilities)}</td>
              <td>Health care</td>
              <td className="center">{ded(slip.healthcare)}</td>
            </tr>
            <tr>
              <td>&nbsp;</td>
              <td />
              <td>Deduction (Loan /<br />Monthly Vehicle)</td>
              <td className="center">{ded(loanVehicle)}</td>
            </tr>
            <tr>
              <td>&nbsp;</td>
              <td />
              <td>Advance Deduction</td>
              <td className="center">{ded(slip.advanceDeduction)}</td>
            </tr>
            <tr>
              <td>&nbsp;</td>
              <td />
              <td>&nbsp;</td>
              <td className="center">–</td>
            </tr>
            <tr>
              <td><b>Gross Salary</b></td>
              <td className="center"><b>{amt(grossSalary)}</b></td>
              <td>Other Deductions</td>
              <td className="center">{ded(slip.otherDeductions)}</td>
            </tr>
            <tr>
              <td>Food Allowance</td>
              <td className="center">{amt(slip.food)}</td>
              <td />
              <td />
            </tr>
            <tr>
              <td>Fuel Allowance</td>
              <td className="center">{amt(slip.fuel)}</td>
              <td />
              <td />
            </tr>
            <tr>
              <td className="pad-top">Over Time/Bonus</td>
              <td className="center pad-top">{amt(slip.overtimePay + slip.bonus)}</td>
              <td />
              <td />
            </tr>
            <tr>
              <td>Arrears</td>
              <td className="center">{amt(slip.arrears)}</td>
              <td />
              <td />
            </tr>
            <tr>
              <td>Other Allowances</td>
              <td className="center">{amt(slip.otherAllowance)}</td>
              <td />
              <td />
            </tr>
            <tr>
              <td className="pad-top">Monthly Allowance</td>
              <td className="center pad-top">{amt(slip.medicalAllowance)}</td>
              <td />
              <td />
            </tr>
            <tr>
              <td>&nbsp;</td>
              <td />
              <td />
              <td />
            </tr>

            <tr>
              <td><b>Total Payments:</b></td>
              <td className="center"><b>{amt(totalPayments)}</b></td>
              <td><b>Total Deduction:</b></td>
              <td className="center"><b>{amt(totalDeduction)}</b></td>
            </tr>
            <tr>
              <td><b>Net Pay:</b></td>
              <td className="center"><b>{amt(netPay)}</b></td>
              <td />
              <td />
            </tr>
          </tbody>
        </table>

        <p className="slip-note">
          Note: This is system generated salary slip and does not require any sign and stamp
        </p>
      </div>

      <style>{`
        .slip-sheet {
          max-width: 820px;
          padding: 28px 34px;
          font-family: Calibri, Carlito, "Segoe UI", system-ui, sans-serif;
          font-size: 11pt;
          color: #000;
        }
        .slip-head { margin-bottom: 8px; font-size: 10.5px; line-height: 1.45; }
        .slip-brand { display: flex; align-items: center; gap: 6px; }
        .slip-wordmark { font-size: 26px; font-weight: 700; letter-spacing: -0.5px; color: #1a1a1a; }
        .slip-mail { color: #0563C1; text-decoration: underline; }
        table.slip { width: 100%; border-collapse: collapse; table-layout: fixed; }
        table.slip td {
          border: 1px solid #000;
          padding: 2px 6px;
          vertical-align: top;
          line-height: 1.5;
        }
        table.slip td.center { text-align: center; }
        table.slip td.pad-top { padding-top: 14px; }
        table.slip td.band { background: #DCE6F1; text-align: center; font-weight: 700; }
        .spacer { height: 1.05em; }
        .slip-note { font-style: italic; font-size: 11px; margin-top: 46px; }
        @media print {
          @page { size: A4; margin: 14mm; }
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .slip-sheet { max-width: none; padding: 0; }
        }
      `}</style>
    </div>
  )
}

function PrintButton() {
  return (
    <form action="javascript:window.print()">
      <button
        type="submit"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-medium hover:bg-slate-700"
      >
        <Printer className="w-4 h-4" />
        Print / Save as PDF
      </button>
    </form>
  )
}
