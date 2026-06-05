import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowLeft, Printer } from 'lucide-react'

interface PageProps { params: Promise<{ id: string }> }

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export default async function PayslipPage({ params }: PageProps) {
  const { id } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
  const payload = verifyToken(token)
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
      employee: {
        include: {
          department: true,
          salary: true,
        },
      },
      payrollRun: true,
    },
  })
  if (!slip) notFound()

  // Authorization: HR sees all, Manager sees team's, Employee sees only their own
  const isOwn = slip.employeeId === user.employee?.id
  const isMyTeamMember = slip.employee.reportingManagerId === user.employee?.id
  if (!isHR && !isOwn && !isMyTeamMember && effectiveRole !== 'EXECUTIVE') {
    return (
      <div className="p-6 bg-amber-50 border border-amber-200 rounded-2xl">
        <h2 className="text-lg font-semibold text-amber-900">Access denied</h2>
        <p className="text-sm text-amber-800 mt-2">You can only view your own payslip.</p>
      </div>
    )
  }

  const totalAllowances =
    slip.houseRent + slip.utilities + slip.food + slip.fuel + slip.medicalAllowance + slip.otherAllowance
  const totalPayments = slip.basic + totalAllowances + slip.overtimePay + slip.bonus
  const totalDeductions = slip.eobi + slip.incomeTax + slip.otherDeductions

  // Format employee type for display
  const empTypeLabel = (t: string | null | undefined) => {
    if (!t) return '—'
    const map: Record<string, string> = {
      PERMANENT: 'Permanent',
      PROBATION: 'Probation',
      INTERNSHIP: 'Internship',
      TRAINING: 'Training',
      CONTRACT: 'Contract',
    }
    return map[t] ?? t
  }

  // Mask bank account for privacy (show last 4)
  const maskedAccount = (acc: string | null | undefined) => {
    if (!acc) return '—'
    if (acc.length <= 4) return acc
    return '•••• •••• ' + acc.slice(-4)
  }

  // Total calendar days in the slip's month (May = 31, April = 30, Feb = 28/29, etc.)
  const daysInMonth = new Date(slip.year, slip.month, 0).getDate()

  return (
    <>
      {/* Print-only styles */}
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          .no-print { display: none !important; }
          body { background: white !important; }
          .payslip-card { box-shadow: none !important; border: 1px solid #ccc !important; }
        }
      `}</style>

      <div className="space-y-4">
        {/* Toolbar — hidden in print */}
        <div className="no-print flex items-center justify-between">
          <Link href="/dashboard/payroll" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
            <ArrowLeft className="w-4 h-4" /> Back to Payroll
          </Link>
          <PrintButton />
        </div>

        {/* ─── PAYSLIP — document-style layout ─── */}
        <div className="payslip-card bg-white max-w-[800px] mx-auto shadow-md print:shadow-none border-t-4 border-blue-700 print:border-t-4">
          <div className="px-12 py-10 print:px-10 print:py-8">

            {/* ─── Header ─────────────────────────────────────── */}
            <header className="flex items-start justify-between gap-8 pb-6 border-b border-slate-200">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-blue-700 rounded flex items-center justify-center text-white text-2xl font-bold">C</div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 leading-tight">Convertt Ltd</h1>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Office 201, 5th Floor, Mega Tower<br />
                    Gulberg Main Boulevard, Lahore, Pakistan<br />
                    finance@convertt.co · +92 370 0488685
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Salary Slip</p>
                <p className="text-2xl font-bold text-slate-900 mt-1.5 leading-none">{MONTHS[slip.month]} {slip.year}</p>
                <p className="text-[10px] text-slate-400 mt-2 font-mono tracking-wider">REF: {slip.id.slice(-8).toUpperCase()}</p>
              </div>
            </header>

            {/* ─── Employee Information ───────────────────────── */}
            <section className="mt-7">
              <h2 className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-semibold mb-3 pb-1.5 border-b border-slate-100">
                Employee Information
              </h2>
              <table className="w-full text-[13px]">
                <tbody>
                  <tr>
                    <Cell label="Employee ID" value={slip.employee.employeeCode} />
                    <Cell label="Employee Name" value={slip.employee.fullName} />
                  </tr>
                  <tr>
                    <Cell label="Designation" value={slip.employee.designation} />
                    <Cell label="Department" value={slip.employee.department?.name ?? '—'} />
                  </tr>
                  <tr>
                    <Cell label="Type of Employment" value={empTypeLabel(slip.employee.employeeType)} />
                    <Cell label="Date of Joining" value={formatDate(slip.employee.joiningDate)} />
                  </tr>
                  <tr>
                    <Cell label="CNIC" value={slip.employee.cnic ?? '—'} />
                    <Cell label="Location" value="Lahore" />
                  </tr>
                  <tr>
                    <Cell label="Working Days" value={`${daysInMonth} (${MONTHS[slip.month]} ${slip.year})`} />
                    <Cell label="Bank Account" value={maskedAccount(slip.employee.bankAccount)} />
                  </tr>
                </tbody>
              </table>
            </section>

            {/* ─── Earnings & Deductions — paired tables ────── */}
            <section className="mt-8 grid grid-cols-2 gap-8">
              <div>
                <h2 className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-semibold mb-3 pb-1.5 border-b border-slate-100">
                  Earnings
                </h2>
                <table className="w-full text-[13px]">
                  <tbody>
                    <LineItem label="Basic Salary" value={slip.basic} />
                    <LineItem label="House Rent" value={slip.houseRent} />
                    <LineItem label="Utilities" value={slip.utilities} />
                    <LineItem label="Food Allowance" value={slip.food} />
                    <LineItem label="Fuel Allowance" value={slip.fuel} />
                    <LineItem label="Medical Allowance" value={slip.medicalAllowance} />
                    <LineItem label="Other Allowances" value={slip.otherAllowance} />
                    <LineItem label="Performance Bonus" value={slip.bonus} />
                    <LineItem label="Overtime" value={slip.overtimePay} />
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300">
                      <td className="pt-3 pb-1 font-bold text-slate-900 text-[13px]">Gross Earnings</td>
                      <td className="pt-3 pb-1 text-right font-bold text-slate-900 text-[13px] tabular-nums">{formatCurrency(totalPayments)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div>
                <h2 className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-semibold mb-3 pb-1.5 border-b border-slate-100">
                  Deductions
                </h2>
                <table className="w-full text-[13px]">
                  <tbody>
                    <LineItem label="Income Tax" value={slip.incomeTax} />
                    <LineItem label="EOBI" value={slip.eobi} />
                    <LineItem label="Other Deductions" value={slip.otherDeductions} />
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300">
                      <td className="pt-3 pb-1 font-bold text-slate-900 text-[13px]">Total Deductions</td>
                      <td className="pt-3 pb-1 text-right font-bold text-slate-900 text-[13px] tabular-nums">{formatCurrency(totalDeductions)}</td>
                    </tr>
                  </tfoot>
                </table>

                {/* Summary mini-block */}
                <div className="mt-6 space-y-1.5 text-[13px]">
                  <div className="flex justify-between text-slate-600">
                    <span>Gross Earnings</span>
                    <span className="tabular-nums">{formatCurrency(totalPayments)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Less: Total Deductions</span>
                    <span className="tabular-nums">({formatCurrency(totalDeductions)})</span>
                  </div>
                </div>
              </div>
            </section>

            {/* ─── Net Pay — clean accent ────────────────────── */}
            <section className="mt-6 border-t-2 border-slate-900 pt-4 flex items-baseline justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-semibold">Net Pay</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Amount payable for {MONTHS[slip.month]} {slip.year}</p>
              </div>
              <p className="text-3xl font-bold text-blue-700 tabular-nums tracking-tight">{formatCurrency(slip.netSalary)}</p>
            </section>

            {/* ─── Footer ─────────────────────────────────────── */}
            <footer className="mt-10 pt-4 border-t border-slate-200">
              <div className="flex items-start justify-between gap-8 text-[10px] text-slate-500">
                <div>
                  <p className="font-semibold text-slate-700 uppercase tracking-wider mb-1">Status</p>
                  <span className={
                    'inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ' +
                    (slip.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' :
                     slip.status === 'APPROVED' ? 'bg-blue-100 text-blue-800' :
                     'bg-amber-100 text-amber-800')
                  }>{slip.status}</span>
                </div>
                <p className="text-right max-w-[260px] italic leading-relaxed">
                  This is a system-generated salary slip and does not require a signature.
                  All figures are in Pakistani Rupees (PKR).
                </p>
              </div>
            </footer>

          </div>
        </div>
      </div>
    </>
  )
}

function LineItem({ label, value }: { label: string; value: number }) {
  return (
    <tr className="border-b border-slate-100 last:border-b-0">
      <td className="py-2 text-slate-700">{label}</td>
      <td className="py-2 text-right text-slate-900 tabular-nums">
        {value > 0 ? formatCurrency(value) : <span className="text-slate-300">—</span>}
      </td>
    </tr>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <td className="py-2 pr-6 align-top w-1/2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-0.5">{label}</div>
      <div className="text-slate-900 font-medium">{value}</div>
    </td>
  )
}

function PrintButton() {
  return (
    <form action="javascript:window.print()">
      <button
        type="submit"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
      >
        <Printer className="w-4 h-4" />
        Print / Save as PDF
      </button>
    </form>
  )
}
