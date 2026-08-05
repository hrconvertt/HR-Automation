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
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #000; font-size: 11px; }
  /* Nothing on a salary slip is a link or a highlight. */
  .slip, .slip * { color: #000 !important; }
  .slip a { text-decoration: none; }
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

  // Matched line for line to the y positions in the issued PDF. The pay
  // column runs 18 lines from Basic Salary to Monthly Allowance; the deduction
  // column has its own gaps, including a line that carries only a dash.
  const zero = (n: number) => (n ? fmtPKR(n) : '0')
  const dashed = (n: number) => (n ? fmtPKR(n) : '-')
  const payLabels = [
    'Basic Salary', 'House Rent', 'Utilities',
    '', '', '', '', '', '',
    'Gross Salary', 'Food Allowance', 'Fuel Allowance',
    '', 'Over Time/Bonus', 'Arrears', 'Other Allowances',
    '', '', 'Monthly Allowance',
  ]
  const payValues = [
    zero(pay.basic), zero(pay.houseRent), zero(pay.utilities),
    '', '', '', '', '', '',
    fmtPKR(grossCore), zero(pay.food), zero(pay.fuel),
    '', zero(pay.overtimeBonus), zero(pay.arrears), zero(pay.otherAllowance),
    '', '', zero(pay.medicalAllowance + pay.monthlyAllowance),
  ]
  const dedLabels = [
    'Income tax', 'EOBI', 'Health care',
    'Deduction (Loan /', 'Monthly Vehicle)', 'Advance Deduction',
    '', '', '',
    'Other Deductions',
  ]
  const dedValues = [
    dashed(ded.incomeTax), dashed(ded.eobi), dashed(ded.healthcare),
    '', dashed(ded.loanAndVehicle), dashed(ded.advance),
    '', '-', '',
    dashed(ded.other),
  ]

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

        {/* Letterhead — 8pt, ranged left at the 72.5pt margin, four lines.
            No right-hand address block: the issued slip has none. */}
        <div style={{ marginBottom: 12 }}>
          <img
            src="data:image/png;base64,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"
            alt="Convertt"
            style={{ height: 20, display: 'block', marginBottom: 3 }}
          />
          <div style={{ fontSize: 8, lineHeight: '9.6pt', color: '#000' }}>
            Convertt Ltd (Generatives)<br />
            Office 201, 5th Floor, Mega Tower, Gulberg Main Blvd, Lahore<br />
            <span style={{ color: '#0563c1', textDecoration: 'underline' }}>finance@convertt.co</span><br />
            +92 370 0488685
          </div>
        </div>

        {/* Column widths measured from the PDF: the table spans the 467pt
            between the margins as 111 / 157 / 112 / 87. Body is 11pt on a 14pt
            line — it had been 9pt, which is why nothing else could be made to
            line up. */}
        <table style={{
          width: '100%', borderCollapse: 'collapse', fontSize: 11,
          lineHeight: '14pt', border: '1px solid #000', color: '#000',
        }}>
          <colgroup>
            <col style={{ width: '23.8%' }} />
            <col style={{ width: '33.6%' }} />
            <col style={{ width: '24.0%' }} />
            <col style={{ width: '18.6%' }} />
          </colgroup>
          <tbody>
            <tr>
              <td colSpan={4} style={{
                ...cell, background: '#dce6f1', textAlign: 'center',
                fontWeight: 700, fontSize: 12,
                WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
              }}>
                Salary Slip
              </td>
            </tr>

            {/* Seven lines each side, with the blanks where the PDF has them:
                the left column skips lines two and three while Designation
                wraps on the right, and the right skips line four. */}
            <tr>
              <td colSpan={2} style={cell}>
                <L k="Employee Number" v={payslip.employee.employeeCode} />
                <Blank /><Blank />
                <L k="DOJ" v={fmtDDMMYYYY(payslip.employee.joiningDate)} bold />
                <L k="Location" v={location} />
                <L k="Account Number" v={accountNumber} />
                <L k="CNIC" v={payslip.employee.cnic ?? '—'} />
              </td>
              <td colSpan={2} style={cell}>
                <L k="Employee Name" v={payslip.employee.fullName} />
                <L k="Designation" v={payslip.employee.designation ?? '—'} />
                <Blank />
                <L k="Salary Month" v={salaryMonthLabel} />
                <L k="Bank/Branch" v={bankBranch} />
                <L k="Total Working Days" v={String(payslip.workingDays)} />
              </td>
            </tr>

            {/* Leave — same four columns, figures centred. */}
            <tr>
              <td style={{ ...cell, fontWeight: 700 }}>Leave Details</td>
              <td style={{ ...cell, fontWeight: 700, textAlign: 'center' }}>Entitled</td>
              <td style={{ ...cell, fontWeight: 700, textAlign: 'center' }}>Availed</td>
              <td style={{ ...cell, fontWeight: 700, textAlign: 'center' }}>Remaining</td>
            </tr>
            <tr>
              <td style={{ ...cell, fontWeight: 700 }}>
                {leaveRows.map((r) => <div key={r.label}>{r.label}</div>)}
              </td>
              <td style={{ ...cell, textAlign: 'center' }}>
                {leaveRows.map((r) => <div key={r.label}>{r.bal.allocated || '-'}</div>)}
              </td>
              <td style={{ ...cell, textAlign: 'center' }}>
                {leaveRows.map((r) => <div key={r.label}>{r.availed || '-'}</div>)}
              </td>
              <td style={{ ...cell, textAlign: 'center' }}>
                {leaveRows.map((r) => <div key={r.label}>{r.bal.remaining || '-'}</div>)}
              </td>
            </tr>

            <tr>
              <td style={{ ...cell, fontWeight: 700 }}>Pay &amp; Allowances</td>
              <td style={{ ...cell, fontWeight: 700, textAlign: 'center' }}>Rs.</td>
              <td style={{ ...cell, fontWeight: 700 }}>Deductions</td>
              <td style={{ ...cell, fontWeight: 700, textAlign: 'center' }}>Rs.</td>
            </tr>

            {/* One cell per column. The blanks are the issued slip's own and
                are what holds Gross Salary level with Other Deductions. */}
            <tr>
              <td style={cell}>
                {payLabels.map((l, i) => (
                  <div key={i} style={{ fontWeight: l === 'Gross Salary' ? 700 : 400 }}>
                    {l || <>&nbsp;</>}
                  </div>
                ))}
              </td>
              <td style={{ ...cell, textAlign: 'center' }}>
                {payValues.map((v, i) => (
                  <div key={i} style={{ fontWeight: payLabels[i] === 'Gross Salary' ? 700 : 400 }}>
                    {v || <>&nbsp;</>}
                  </div>
                ))}
              </td>
              <td style={cell}>
                {dedLabels.map((l, i) => <div key={i}>{l || <>&nbsp;</>}</div>)}
              </td>
              <td style={{ ...cell, textAlign: 'center' }}>
                {dedValues.map((v, i) => <div key={i}>{v || <>&nbsp;</>}</div>)}
              </td>
            </tr>

            <tr>
              <td style={{ ...cell, fontWeight: 700 }}>Total Payments:</td>
              <td style={{ ...cell, fontWeight: 700, textAlign: 'center' }}>{fmtPKR(totalPayments)}</td>
              <td style={{ ...cell, fontWeight: 700 }}>Total Deduction:</td>
              <td style={{ ...cell, fontWeight: 700, textAlign: 'center' }}>{fmtPKR(totalDeductions)}</td>
            </tr>
            <tr>
              <td style={{ ...cell, fontWeight: 700 }}>Net Pay:</td>
              <td style={{ ...cell, fontWeight: 700, textAlign: 'center' }}>{fmtPKR(netPay)}</td>
              <td colSpan={2} style={cell} />
            </tr>
          </tbody>
        </table>

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

const cell: React.CSSProperties = {
  border: '1px solid #000', padding: '1pt 5pt', fontSize: 11,
  lineHeight: '14pt', verticalAlign: 'top', color: '#000',
}

/** A line the issued slip leaves empty, holding the 14pt rhythm. */
function Blank() {
  return <div>&nbsp;</div>
}

/** "Employee Number: CON-UIUX-040" — label bold, value not. DOJ is the one
 *  line where the issued slip sets the value bold as well. */
function L({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return <div><strong>{k}:</strong> {bold ? <strong>{v}</strong> : v}</div>
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

