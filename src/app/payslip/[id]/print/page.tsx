/**
 * Printable salary slip — A4 layout matching the Convertt template the
 * user shared. Server-rendered (not under /dashboard so the print view
 * is chrome-free), auto-fires window.print() 400ms after load.
 *
 * Auth:
 *   • The employee whose payslip this is.
 *   • HR_ADMIN (any payslip).
 *   • Other roles → 403 message.
 *
 * Field mapping is documented in the AGENTS.md spec for F3.
 */
import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface PageProps { params: Promise<{ id: string }> }

const PRINT_CSS = `
  @page { size: A4; margin: 14mm 14mm; }
  html, body { background: #fff; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111827; font-size: 11px; }
  @media print {
    .no-print { display: none !important; }
    .slip-page { box-shadow: none !important; margin: 0 !important; }
  }
  @media screen {
    body { background: #f3f4f6; padding: 24px 0; }
  }
  table { border-collapse: collapse; width: 100%; }
  .convertt-green { color: #059669; }
`

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

function fmtDDMMYYYY(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  const dd = String(dt.getDate()).padStart(2, '0')
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${dt.getFullYear()}`
}

function fmtPKR(n: number | null | undefined): string {
  if (n == null || n === 0) return '-'
  return new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(n)
}

function humanizeWorkLocation(v: string | null | undefined): string {
  if (!v) return 'Head Office'
  if (v === 'ONSITE') return 'Head Office'
  return v
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

export default async function PrintPayslipPage({ params }: PageProps) {
  const { id } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const tokenPayload = await verifyToken(token)
  if (!tokenPayload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: tokenPayload.userId },
    include: { employee: { select: { id: true } } },
  })
  if (!user) redirect('/login')

  const previewRole =
    user.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role
  const myEmpId = user.employee?.id ?? null

  const payslip = await prisma.payslip.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          id: true, fullName: true, employeeCode: true, designation: true,
          joiningDate: true, workLocation: true, ibanAccount: true,
          bankAccount: true, bankName: true, bankBranch: true, cnic: true,
        },
      },
    },
  })
  if (!payslip) notFound()

  const isOwn = payslip.employeeId === myEmpId
  const isHR = effectiveRole === 'HR_ADMIN'
  if (!isOwn && !isHR) {
    return (
      <div style={{ padding: 40 }}>
        <h1 style={{ color: '#b91c1c', fontSize: 20, fontWeight: 700 }}>Access denied</h1>
        <p style={{ color: '#7f1d1d', marginTop: 8 }}>
          You don&apos;t have permission to view this payslip.
        </p>
      </div>
    )
  }

  const monthName = MONTHS[payslip.month - 1] ?? '—'
  const salaryMonthLabel = `${monthName} ${payslip.year}`

  // Leave details — pull yearly LeaveBalance + count APPROVED LeaveRequests
  // overlapping the payslip month for the "Availed" column.
  const balances = await prisma.leaveBalance.findMany({
    where: { employeeId: payslip.employeeId, year: payslip.year },
  })

  const monthStart = new Date(Date.UTC(payslip.year, payslip.month - 1, 1))
  const monthEnd = new Date(Date.UTC(payslip.year, payslip.month, 0, 23, 59, 59))
  const monthLeaves = await prisma.leaveRequest.findMany({
    where: {
      employeeId: payslip.employeeId,
      status: 'APPROVED',
      fromDate: { lte: monthEnd },
      toDate: { gte: monthStart },
    },
    select: { leaveType: true, days: true },
  })
  const availedByType = monthLeaves.reduce<Record<string, number>>((acc, r) => {
    acc[r.leaveType] = (acc[r.leaveType] ?? 0) + r.days
    return acc
  }, {})

  // The Convertt template shows Casual / Sick / Annual. Map whatever balances
  // exist; "Annual" maps from EARNED if no ANNUAL record exists (legacy data).
  const balByType = balances.reduce<Record<string, { allocated: number; used: number; remaining: number }>>((acc, b) => {
    acc[b.leaveType] = { allocated: b.allocated, used: b.used, remaining: b.remaining }
    return acc
  }, {})
  const annualBal = balByType.ANNUAL ?? balByType.EARNED ?? { allocated: 0, used: 0, remaining: 0 }
  const leaveRows = [
    { label: 'Casual',  bal: balByType.CASUAL ?? { allocated: 0, used: 0, remaining: 0 }, availed: availedByType.CASUAL ?? 0 },
    { label: 'Sick',    bal: balByType.SICK   ?? { allocated: 0, used: 0, remaining: 0 }, availed: availedByType.SICK ?? 0 },
    { label: 'Annual',  bal: annualBal,                                                    availed: (availedByType.ANNUAL ?? 0) + (availedByType.EARNED ?? 0) },
  ]

  // Pay & Allowances (direct from Payslip)
  const pay = {
    basic: payslip.basic,
    houseRent: payslip.houseRent,
    utilities: payslip.utilities,
    food: payslip.food,
    fuel: payslip.fuel,
    overtimeBonus: (payslip.overtimePay ?? 0) + (payslip.bonus ?? 0),
    arrears: payslip.arrears,
    otherAllowance: payslip.otherAllowance,
    medicalAllowance: payslip.medicalAllowance,
    monthlyAllowance: 0, // not modelled as a separate field today
  }
  // Gross stat per Convertt template = Basic + House Rent + Utilities (cash core).
  // We display the Payslip.grossSalary as the bottom Total Payments line.
  const grossCore = pay.basic + pay.houseRent + pay.utilities

  // Deductions
  const ded = {
    incomeTax: payslip.incomeTax,
    eobi: payslip.eobi,
    healthcare: payslip.healthcare,
    loanAndVehicle: (payslip.loanDeduction ?? 0) + (payslip.vehicleDeduction ?? 0),
    advance: payslip.advanceDeduction,
    other: payslip.otherDeductions,
  }
  const totalDeductions =
    ded.incomeTax + ded.eobi + ded.healthcare + ded.loanAndVehicle + ded.advance + ded.other

  const totalPayments = payslip.grossSalary
  const netPay = payslip.netSalary

  const accountNumber = payslip.employee.ibanAccount ?? payslip.employee.bankAccount ?? '—'
  const bankBranch = [payslip.employee.bankName, payslip.employee.bankBranch]
    .filter(Boolean).join(' / ') || '—'
  const location = humanizeWorkLocation(payslip.employee.workLocation)

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div
        className="slip-page"
        style={{
          maxWidth: '210mm',
          margin: '0 auto',
          minHeight: '297mm',
          background: '#fff',
          padding: '14mm 14mm',
          boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
          boxSizing: 'border-box',
        }}
      >
        {/* Top action bar — hidden on print */}
        <div
          className="no-print"
          style={{
            marginBottom: 12,
            paddingBottom: 8,
            borderBottom: '1px dashed #d1d5db',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            Preview — use your browser&apos;s Print (Ctrl/Cmd&nbsp;+&nbsp;P) and save as PDF.
          </span>
          <button
            type="button"
            onClick={undefined}
            style={{
              padding: '6px 14px', borderRadius: 6, background: '#111827',
              color: '#fff', fontSize: 12, border: 'none',
            }}
            // Re-trigger via inline handler for client interactivity.
            // (We're a server component; printing is handled by the script below.)
          >
            Print
          </button>
          {/* Auto-trigger print on screen-sized viewports */}
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{if(window.matchMedia('(min-width: 600px)').matches){setTimeout(function(){window.print();},400);}var b=document.currentScript&&document.currentScript.previousElementSibling;if(b){b.addEventListener('click',function(){window.print();});}}catch(e){}})();`,
            }}
          />
        </div>

        {/* ─── Header — logo + company block ─────────────────────── */}
        <header style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          {/* Inline SVG logo — simple leaf/checkmark mark in Convertt green */}
          <svg width="48" height="48" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="32" cy="32" r="30" fill="#059669" />
            <path d="M18 33 L28 43 L46 22" stroke="#fff" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#065f46' }}>
              Convertt Ltd <span style={{ fontWeight: 400, color: '#4b5563', fontSize: 12 }}>(Generatives)</span>
            </div>
            <div style={{ fontSize: 10, color: '#374151', lineHeight: 1.4, marginTop: 2 }}>
              Office 201, 5th Floor, Mega Tower, Gulberg Main Blvd, Lahore<br />
              finance@convertt.co &nbsp;·&nbsp; +92 370 0488685
            </div>
          </div>
        </header>

        {/* ─── Title ─────────────────────────────────────────────── */}
        <h1 style={{
          textAlign: 'center', fontSize: 18, fontWeight: 700,
          margin: '8px 0 16px', letterSpacing: 0.5, color: '#111827',
        }}>
          Salary Slip
        </h1>

        {/* ─── Employee block ─────────────────────────────────────── */}
        <table style={{
          marginBottom: 14, border: '1px solid #d1d5db', fontSize: 11,
        }}>
          <tbody>
            <EmpRow left={['Employee Number', payslip.employee.employeeCode]} right={['Employee Name', payslip.employee.fullName]} />
            <EmpRow left={['DOJ', fmtDDMMYYYY(payslip.employee.joiningDate)]} right={['Designation', payslip.employee.designation]} />
            <EmpRow left={['Location', location]} right={['Salary Month', salaryMonthLabel]} />
            <EmpRow left={['Account Number', accountNumber]} right={['Bank / Branch', bankBranch]} />
            <EmpRow left={['CNIC', payslip.employee.cnic ?? '—']} right={['Total Working Days', String(payslip.workingDays)]} />
          </tbody>
        </table>

        {/* ─── Leave Details ─────────────────────────────────────── */}
        <table style={{ marginBottom: 14, border: '1px solid #d1d5db', fontSize: 11 }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              <th style={hdrCell}>Leave Details</th>
              <th style={hdrCell}>Entitled</th>
              <th style={hdrCell}>Availed</th>
              <th style={hdrCell}>Remaining</th>
            </tr>
          </thead>
          <tbody>
            {leaveRows.map((r) => (
              <tr key={r.label}>
                <td style={lblCell}>{r.label}</td>
                <td style={numCell}>{r.bal.allocated || '-'}</td>
                <td style={numCell}>{r.availed || '-'}</td>
                <td style={numCell}>{r.bal.remaining || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ─── Pay & Allowances + Deductions — side-by-side ──────── */}
        <table style={{ marginBottom: 14, borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ verticalAlign: 'top', width: '50%', paddingRight: 6 }}>
                <table style={{ border: '1px solid #d1d5db', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6' }}>
                      <th style={hdrCell}>Pay &amp; Allowances</th>
                      <th style={{ ...hdrCell, textAlign: 'right' }}>Rs.</th>
                    </tr>
                  </thead>
                  <tbody>
                    <PayLine label="Basic Salary" value={pay.basic} />
                    <PayLine label="House Rent" value={pay.houseRent} />
                    <PayLine label="Utilities" value={pay.utilities} />
                    <tr style={{ background: '#ecfdf5' }}>
                      <td style={{ ...lblCell, fontWeight: 700 }}>Gross Salary</td>
                      <td style={{ ...numCell, fontWeight: 700 }}>{fmtPKR(grossCore)}</td>
                    </tr>
                    <PayLine label="Food Allowance" value={pay.food} />
                    <PayLine label="Fuel Allowance" value={pay.fuel} />
                    <PayLine label="Over Time / Bonus" value={pay.overtimeBonus} />
                    <PayLine label="Arrears" value={pay.arrears} />
                    <PayLine label="Other Allowances" value={pay.otherAllowance} />
                    <PayLine label="Monthly Allowance" value={pay.medicalAllowance + pay.monthlyAllowance} />
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f9fafb', borderTop: '2px solid #111827' }}>
                      <td style={{ ...lblCell, fontWeight: 700 }}>Total Payments:</td>
                      <td style={{ ...numCell, fontWeight: 700 }}>{fmtPKR(totalPayments)}</td>
                    </tr>
                  </tfoot>
                </table>
              </td>
              <td style={{ verticalAlign: 'top', width: '50%', paddingLeft: 6 }}>
                <table style={{ border: '1px solid #d1d5db', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6' }}>
                      <th style={hdrCell}>Deductions</th>
                      <th style={{ ...hdrCell, textAlign: 'right' }}>Rs.</th>
                    </tr>
                  </thead>
                  <tbody>
                    <PayLine label="Income tax" value={ded.incomeTax} />
                    <PayLine label="EOBI" value={ded.eobi} />
                    <PayLine label="Health care" value={ded.healthcare} />
                    <PayLine label="Deduction (Loan / Monthly Vehicle)" value={ded.loanAndVehicle} />
                    <PayLine label="Advance Deduction" value={ded.advance} />
                    <PayLine label="Other Deductions" value={ded.other} />
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f9fafb', borderTop: '2px solid #111827' }}>
                      <td style={{ ...lblCell, fontWeight: 700 }}>Total Deduction:</td>
                      <td style={{ ...numCell, fontWeight: 700 }}>{fmtPKR(totalDeductions)}</td>
                    </tr>
                  </tfoot>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ─── Net Pay ───────────────────────────────────────────── */}
        <div style={{
          background: '#065f46', color: '#fff', padding: '10px 14px',
          borderRadius: 4, display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', fontSize: 14, fontWeight: 700,
        }}>
          <span>Net Pay</span>
          <span>{fmtPKR(netPay)}</span>
        </div>

        {/* ─── Footer note ───────────────────────────────────────── */}
        <p style={{
          marginTop: 18, fontSize: 10, color: '#6b7280',
          textAlign: 'center', fontStyle: 'italic',
        }}>
          Note: This is system generated salary slip and does not require any sign and stamp.
        </p>
      </div>
    </>
  )
}

const hdrCell: React.CSSProperties = {
  border: '1px solid #d1d5db', padding: '5px 8px', fontWeight: 700,
  fontSize: 11, textAlign: 'left', color: '#111827',
}
const lblCell: React.CSSProperties = {
  border: '1px solid #d1d5db', padding: '5px 8px', fontSize: 11, color: '#1f2937',
}
const numCell: React.CSSProperties = {
  border: '1px solid #d1d5db', padding: '5px 8px', fontSize: 11,
  textAlign: 'right', color: '#1f2937', fontVariantNumeric: 'tabular-nums',
}

function EmpRow({ left, right }: { left: [string, string]; right: [string, string] }) {
  return (
    <tr>
      <td style={{ ...lblCell, fontWeight: 600, width: '20%' }}>{left[0]}</td>
      <td style={{ ...lblCell, width: '30%' }}>{left[1]}</td>
      <td style={{ ...lblCell, fontWeight: 600, width: '20%' }}>{right[0]}</td>
      <td style={{ ...lblCell, width: '30%' }}>{right[1]}</td>
    </tr>
  )
}

function PayLine({ label, value }: { label: string; value: number }) {
  return (
    <tr>
      <td style={lblCell}>{label}</td>
      <td style={numCell}>{fmtPKR(value)}</td>
    </tr>
  )
}
