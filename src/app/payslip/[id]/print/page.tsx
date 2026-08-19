/**
 * Printable salary slip — A4 layout matching the Convertt template the
 * user shared. Server-rendered (not under /dashboard so the print view
 * is chrome-free). Printing is the button and nothing else — it used to fire
 * the print dialog by itself 400ms after load, so an employee opening their
 * slip from a notification was met with a system dialog they had not asked
 * for.
 *
 * Auth:
 *   • The employee whose payslip this is.
 *   • HR_ADMIN (any payslip).
 *   • Other roles → 403 message.
 *
 * Field mapping is documented in the AGENTS.md spec for F3.
 */
import { bankLabel } from '@/lib/bank-codes'
import { LOGO_DATA_URI } from '@/lib/brand-logo'
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
          joiningDate: true, exitDate: true, workLocation: true, ibanAccount: true,
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
  // Falls back to the IBAN when no name was typed in: the four letters after
  // the check digits say which bank it is, and that is the same number printed
  // two lines above on the slip.
  const bankBranch = bankLabel(
    payslip.employee.bankName,
    payslip.employee.bankBranch,
    payslip.employee.ibanAccount ?? payslip.employee.bankAccount,
  )
  const location = humanizeWorkLocation(payslip.employee.workLocation)

  // Total Working Days is the calendar-days method the issued slips use: the
  // days in the month, or the days actually served when someone joined or left
  // part-way through. Laiba joined on 13 July and her slip read 31, while her
  // pay had already been prorated to 19/31 — the document contradicted itself,
  // and it reads as though she was paid a full month at a lower rate.
  //
  // Display only. The stored workingDays feeds the pay calculation, which is
  // reconciled against the salary sheet to the rupee and is not being touched.
  const daysInMonth = new Date(Date.UTC(payslip.year, payslip.month, 0)).getUTCDate()
  const lastDay = new Date(Date.UTC(payslip.year, payslip.month - 1, daysInMonth))
  const firstDay = new Date(Date.UTC(payslip.year, payslip.month - 1, 1))
  const joined = payslip.employee.joiningDate
  const left = payslip.employee.exitDate
  const from = joined && joined > firstDay ? joined : firstDay
  const to = left && left < lastDay ? left : lastDay
  const daysServed = Math.max(
    0,
    Math.round((to.getTime() - from.getTime()) / 86400000) + 1,
  )
  const partMonth = daysServed !== daysInMonth

  // Matched line for line to the y positions in the issued PDF. The pay
  // column runs 18 lines from Basic Salary to Monthly Allowance; the deduction
  // column has its own gaps, including a line that carries only a dash.
  // Zero is written three different ways on the issued slip and each one means
  // something. An allowance of nothing is a figure, so it prints 0. A deduction
  // that never happened is an absence, so it prints a dash. A total is always a
  // figure even when it comes to nothing — Zuhaa's Total Deduction reads 0, not
  // a dash, because the column was added up and the answer was zero.
  //
  // fmtPKR returns a dash for zero, which is right for deductions and wrong for
  // everything else, so the totals go through num().
  const zero = (n: number) => (n ? fmtPKR(n) : '0')
  const dashed = (n: number) => (n ? fmtPKR(n) : '-')
  const num = (n: number) => (n ? fmtPKR(n) : '0')
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
    num(grossCore), zero(pay.food), zero(pay.fuel),
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
              __html: `(function(){try{var b=document.currentScript&&document.currentScript.previousElementSibling;if(b){b.addEventListener('click',function(){window.print();});}}catch(e){}})();`,
            }}
          />
        </div>

        {/* Letterhead — 8pt, ranged left at the 72.5pt margin, four lines.
            No right-hand address block: the issued slip has none. */}
        <div style={{ marginBottom: 12 }}>
          {/* One mark for every document: the Playbook logo from
              src/lib/brand-logo. This slip used to carry its own base64 copy
              of an older dark-green wordmark, so the salary slip and the
              letters did not look like the same company. */}
          <img
            src={LOGO_DATA_URI}
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
                <L k="Total Working Days" v={partMonth ? `${daysServed} of ${daysInMonth}` : String(daysInMonth)} />
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
              <td style={{ ...ruled, borderTop: '1px solid #000', fontWeight: 700, textAlign: 'center' }}>{num(totalPayments)}</td>
              <td style={{ ...ruled, borderTop: '1px solid #000', fontWeight: 700 }}>Total Deduction:</td>
              <td style={{ ...ruled, borderTop: '1px solid #000', fontWeight: 700, textAlign: 'center' }}>{num(totalDeductions)}</td>
            </tr>
            {/* No divider after the second column on this row. */}
            <tr>
              <td style={{ ...base, borderTop: '1px solid #000', fontWeight: 700 }}>Net Pay:</td>
              <td style={{ ...ruled, borderTop: '1px solid #000', fontWeight: 700, textAlign: 'center' }}>{num(netPay)}</td>
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

