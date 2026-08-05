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
  /* The issued PDF embeds Carlito, which is the metric clone of Calibri.
     Ours was Helvetica/Arial — different letterforms and different advance
     widths, so the same 11pt text set to a different length on every line. */
  body {
    font-family: Carlito, Calibri, 'Segoe UI', Candara, sans-serif;
    color: #000; font-size: 11px;
  }
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
    '', '', 'Monthly Allowance', '', '',
  ]
  const payValues = [
    zero(pay.basic), zero(pay.houseRent), zero(pay.utilities),
    '', '', '', '', '', '',
    fmtPKR(grossCore), zero(pay.food), zero(pay.fuel),
    '', zero(pay.overtimeBonus), zero(pay.arrears), zero(pay.otherAllowance),
    '', '', zero(pay.medicalAllowance + pay.monthlyAllowance), '', '',
  ]
  const dedLabels = [
    'Income tax', 'EOBI', 'Health care',
    'Deduction (Loan /', 'Monthly Vehicle)', 'Advance Deduction',
    '', '', '',
    'Other Deductions', '', '', '', '', '', '', '', '', '', '', '',
  ]
  const dedValues = [
    dashed(ded.incomeTax), dashed(ded.eobi), dashed(ded.healthcare),
    '', dashed(ded.loanAndVehicle), dashed(ded.advance),
    '', '-', '',
    dashed(ded.other), '', '', '', '', '', '', '', '', '', '', '',
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
          {/* The mark taken out of the issued PDF itself — 222x35, green
              symbol with Convertt in dark green. The letterhead file is a
              different logo: black CONVERTT, wider. They are not
              interchangeable and I had been using the wrong one. */}
          <img
            src="data:image/png;base64,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"
            alt="Convertt"
            style={{ width: '98pt', display: 'block', marginBottom: 3 }}
          />
          <div style={{ fontSize: 8, lineHeight: '9.6pt', color: '#000' }}>
            Convertt Ltd (Generatives)<br />
            Office 201, 5th Floor, Mega Tower, Gulberg Main Blvd, Lahore<br />
            <span style={{ color: '#0563c1', textDecoration: 'underline' }}>finance@convertt.co</span><br />
            +92 370 0488685
          </div>
        </div>

        {/* Every rule below is drawn where the PDF draws one and nowhere
            else. The employee block and the leave rows have no vertical
            dividers at all — only the pay body and the totals do — and the
            Net Pay row has none after the second column. It was never a full
            grid, which is why a full grid never looked like it.

            Columns are 119 / 154 / 108 / 98 of the 479pt width. Body 11pt on
            a 14pt line. */}
        <table style={{
          width: '100%', borderCollapse: 'collapse', fontSize: 11,
          lineHeight: '14pt', border: '1px solid #000', color: '#000',
          tableLayout: 'fixed',
        }}>
          <colgroup>
            <col style={{ width: '24.8%' }} />
            <col style={{ width: '32.2%' }} />
            <col style={{ width: '22.5%' }} />
            <col style={{ width: '20.5%' }} />
          </colgroup>
          <tbody>
            <tr>
              <td colSpan={4} style={{
                ...under, background: '#bdd7ee', textAlign: 'center',
                fontWeight: 700, fontSize: 12, lineHeight: '21pt', height: '21pt',
                WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
              }}>
                Salary Slip
              </td>
            </tr>

            {/* Seven lines a side, no divider between them. */}
            <tr>
              <td colSpan={2} style={under}>
                <L k="Employee Number" v={payslip.employee.employeeCode} />
                <Blank /><Blank />
                <L k="DOJ" v={fmtDDMMYYYY(payslip.employee.joiningDate)} bold />
                <L k="Location" v={location} />
                <L k="Account Number" v={accountNumber} />
                <L k="CNIC" v={payslip.employee.cnic ?? '—'} />
              </td>
              <td colSpan={2} style={under}>
                <L k="Employee Name" v={payslip.employee.fullName} />
                <L k="Designation" v={payslip.employee.designation ?? '—'} />
                <Blank />
                <L k="Salary Month" v={salaryMonthLabel} />
                <L k="Bank/Branch" v={bankBranch} />
                <L k="Total Working Days" v={String(payslip.workingDays)} />
              </td>
            </tr>

            {/* Leave — four lines, still no vertical rules. */}
            <tr>
              <td style={{ ...under, fontWeight: 700 }}>
                <div>Leave Details</div>
                {leaveRows.map((r) => <div key={r.label} style={{ fontWeight: 700 }}>{r.label}</div>)}
              </td>
              <td style={{ ...under, textAlign: 'center' }}>
                <div style={{ fontWeight: 700 }}>Entitled</div>
                {leaveRows.map((r) => <div key={r.label}>{r.bal.allocated || '-'}</div>)}
              </td>
              <td style={{ ...under, textAlign: 'center' }}>
                <div style={{ fontWeight: 700 }}>Availed</div>
                {leaveRows.map((r) => <div key={r.label}>{r.availed || '-'}</div>)}
              </td>
              <td style={{ ...under, textAlign: 'center' }}>
                <div style={{ fontWeight: 700 }}>Remaining</div>
                {leaveRows.map((r) => <div key={r.label}>{r.bal.remaining || '-'}</div>)}
              </td>
            </tr>

            {/* From here down the dividers appear. */}
            <tr>
              <td style={base}>
                <div style={{ fontWeight: 700 }}>Pay &amp; Allowances</div>
                {payLabels.map((l, i) => (
                  <div key={i} style={{ fontWeight: l === 'Gross Salary' ? 700 : 400 }}>
                    {l || <>&nbsp;</>}
                  </div>
                ))}
              </td>
              <td style={{ ...ruled, textAlign: 'center' }}>
                <div style={{ fontWeight: 700 }}>Rs.</div>
                {payValues.map((v, i) => (
                  <div key={i} style={{ fontWeight: payLabels[i] === 'Gross Salary' ? 700 : 400 }}>
                    {v || <>&nbsp;</>}
                  </div>
                ))}
              </td>
              <td style={ruled}>
                <div style={{ fontWeight: 700 }}>Deductions</div>
                {dedLabels.map((l, i) => <div key={i}>{l || <>&nbsp;</>}</div>)}
              </td>
              <td style={{ ...ruled, textAlign: 'center' }}>
                <div style={{ fontWeight: 700 }}>Rs.</div>
                {dedValues.map((v, i) => <div key={i}>{v || <>&nbsp;</>}</div>)}
              </td>
            </tr>

            <tr>
              <td style={{ ...base, borderTop: '1px solid #000', fontWeight: 700 }}>Total Payments:</td>
              <td style={{ ...ruled, borderTop: '1px solid #000', fontWeight: 700, textAlign: 'center' }}>{fmtPKR(totalPayments)}</td>
              <td style={{ ...ruled, borderTop: '1px solid #000', fontWeight: 700 }}>Total Deduction:</td>
              <td style={{ ...ruled, borderTop: '1px solid #000', fontWeight: 700, textAlign: 'center' }}>{fmtPKR(totalDeductions)}</td>
            </tr>
            {/* No divider after the second column on this row. */}
            <tr>
              <td style={{ ...base, borderTop: '1px solid #000', fontWeight: 700 }}>Net Pay:</td>
              <td style={{ ...ruled, borderTop: '1px solid #000', fontWeight: 700, textAlign: 'center' }}>{fmtPKR(netPay)}</td>
              <td colSpan={2} style={{ ...ruled, borderTop: '1px solid #000' }} />
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

const base: React.CSSProperties = {
  padding: '0 5pt', fontSize: 11, lineHeight: '14pt',
  verticalAlign: 'top', color: '#000', border: 'none',
}

/** A cell with no rules of its own — the employee block and the leave rows. */
const cell: React.CSSProperties = base

/** Columns two, three and four in the pay body carry a rule on their left. */
const ruled: React.CSSProperties = { ...base, borderLeft: '1px solid #000' }

/** Rows that are closed off underneath: title, employee block, leave. */
const under: React.CSSProperties = { ...base, borderBottom: '1px solid #000' }

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

