/**
 * Printable Increment / Salary Revision Letter — A4, Convertt-branded.
 * Renders one CompensationHistory row as a formal letter, auto-fires
 * window.print() 400ms after load (same UX as the salary slip).
 *
 * Auth:
 *   • The employee whose comp this concerns can view their own.
 *   • HR_ADMIN can view any.
 *   • All other roles → 403 message.
 *
 * URL: /increment-letter/<compensationHistoryId>/print
 */
import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface PageProps { params: Promise<{ salaryHistoryId: string }> }

const PRINT_CSS = `
  @page { size: A4; margin: 18mm 18mm; }
  html, body { background: #fff; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111827; font-size: 12px; }
  @media print {
    .no-print { display: none !important; }
    .letter-page { box-shadow: none !important; margin: 0 !important; }
  }
  @media screen {
    body { background: #f3f4f6; padding: 24px 0; }
  }
`

const REASON_LABELS: Record<string, string> = {
  INCREMENT:  'Annual Review',
  PROMOTION:  'Promotion',
  ADJUSTMENT: 'Market Adjustment',
  BONUS:      'Performance Bonus',
  INITIAL:    'Initial Compensation',
}

function fmtLongDate(d: Date | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
}

function fmtPKR(n: number | null | undefined): string {
  if (n == null) return '-'
  return 'PKR ' + new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(n)
}

export default async function PrintIncrementLetterPage({ params }: PageProps) {
  const { salaryHistoryId } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
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

  const history = await prisma.compensationHistory.findUnique({
    where: { id: salaryHistoryId },
    include: {
      employee: {
        select: {
          id: true, fullName: true, employeeCode: true, designation: true,
          department: { select: { name: true } },
        },
      },
    },
  })
  if (!history) notFound()

  const isOwn = history.employeeId === myEmpId
  const isHR = effectiveRole === 'HR_ADMIN'
  if (!isOwn && !isHR) {
    return (
      <div style={{ padding: 40 }}>
        <h1 style={{ color: '#b91c1c', fontSize: 20, fontWeight: 700 }}>Access denied</h1>
        <p style={{ color: '#7f1d1d', marginTop: 8 }}>
          You don&apos;t have permission to view this increment letter.
        </p>
      </div>
    )
  }

  // HR signatory — first HR_ADMIN user with a linked employee.
  const hrUser = await prisma.user.findFirst({
    where: { role: 'HR_ADMIN', employee: { isNot: null } },
    include: { employee: { select: { fullName: true } } },
    orderBy: { createdAt: 'asc' },
  })
  const hrName = hrUser?.employee?.fullName ?? 'HR Department'

  const delta = history.newSalary - history.oldSalary
  const pct = history.incrementPct ?? (history.oldSalary > 0
    ? (delta / history.oldSalary) * 100
    : null)
  const reasonLabel = REASON_LABELS[history.type] ?? history.type

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div
        className="letter-page"
        style={{
          maxWidth: '210mm',
          margin: '0 auto',
          minHeight: '297mm',
          background: '#fff',
          padding: '18mm 18mm',
          boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
          boxSizing: 'border-box',
          lineHeight: 1.55,
        }}
      >
        {/* Top action bar — hidden on print */}
        <div
          className="no-print"
          style={{
            marginBottom: 14, paddingBottom: 8,
            borderBottom: '1px dashed #d1d5db',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            Preview — use your browser&apos;s Print (Ctrl/Cmd&nbsp;+&nbsp;P) and save as PDF.
          </span>
          <button
            type="button"
            style={{
              padding: '6px 14px', borderRadius: 6, background: '#111827',
              color: '#fff', fontSize: 12, border: 'none',
            }}
          >
            Print
          </button>
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{if(window.matchMedia('(min-width: 600px)').matches){setTimeout(function(){window.print();},400);}var b=document.currentScript&&document.currentScript.previousElementSibling;if(b){b.addEventListener('click',function(){window.print();});}}catch(e){}})();`,
            }}
          />
        </div>

        {/* ─── Header — logo + company block (matches payslip) ───── */}
        <header style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
          <svg width="56" height="56" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="32" cy="32" r="30" fill="#059669" />
            <path d="M18 33 L28 43 L46 22" stroke="#fff" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#065f46' }}>
              Convertt Ltd <span style={{ fontWeight: 400, color: '#4b5563', fontSize: 12 }}>(Generatives)</span>
            </div>
            <div style={{ fontSize: 10, color: '#374151', lineHeight: 1.4, marginTop: 2 }}>
              Office 201, 5th Floor, Mega Tower, Gulberg Main Blvd, Lahore<br />
              hr@convertt.co &nbsp;·&nbsp; +92 370 0488685
            </div>
          </div>
        </header>

        {/* ─── Title + date ──────────────────────────────────────── */}
        <h1 style={{
          textAlign: 'center', fontSize: 18, fontWeight: 700,
          margin: '6px 0 4px', letterSpacing: 0.5, color: '#111827',
          textTransform: 'uppercase',
        }}>
          Increment / Salary Revision Letter
        </h1>
        <p style={{ textAlign: 'center', fontSize: 11, color: '#6b7280', marginBottom: 22 }}>
          Dated: {fmtLongDate(history.effectiveDate)}
        </p>

        {/* ─── Salutation ────────────────────────────────────────── */}
        <p style={{ marginBottom: 12, fontSize: 12 }}>
          Dear <strong>{history.employee.fullName}</strong>,
        </p>

        <p style={{ marginBottom: 16, fontSize: 12, textAlign: 'justify' }}>
          We are pleased to inform you that following the recent salary review,
          your compensation has been revised as follows:
        </p>

        {/* ─── Details block ─────────────────────────────────────── */}
        <table style={{
          width: '100%', borderCollapse: 'collapse', fontSize: 12,
          marginBottom: 18,
        }}>
          <tbody>
            <Row label="Employee Code"  value={history.employee.employeeCode} />
            <Row label="Designation"     value={history.employee.designation} />
            <Row label="Department"      value={history.employee.department?.name ?? '—'} />
            <Row label="Effective Date"  value={fmtLongDate(history.effectiveDate)} />
            <Row label="Previous Gross"  value={fmtPKR(history.oldSalary)} />
            <Row label="Revised Gross"   value={fmtPKR(history.newSalary)} bold />
            <Row
              label="Increase"
              value={
                delta === 0
                  ? '—'
                  : `${delta > 0 ? '+' : ''}${fmtPKR(delta)}${pct != null ? `  (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)` : ''}`
              }
              tone={delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral'}
            />
            <Row label="Reason" value={reasonLabel} />
            {history.notes && history.notes.trim() && (
              <Row label="Manager Comment" value={history.notes} />
            )}
          </tbody>
        </table>

        <p style={{ marginBottom: 14, fontSize: 12, textAlign: 'justify' }}>
          This revision will be reflected in your next payroll cycle starting
          {' '}<strong>{fmtLongDate(history.effectiveDate)}</strong>.
        </p>

        <p style={{ marginBottom: 30, fontSize: 12, textAlign: 'justify' }}>
          We value your contributions to Convertt and look forward to your
          continued performance and growth.
        </p>

        <p style={{ marginBottom: 6, fontSize: 12 }}>Sincerely,</p>
        <p style={{ marginBottom: 28, fontSize: 12, fontWeight: 600 }}>
          HR Department, Convertt
        </p>

        {/* ─── Signatures ────────────────────────────────────────── */}
        <table style={{ width: '100%', marginTop: 24, fontSize: 11 }}>
          <tbody>
            <tr>
              <td style={{ width: '50%', verticalAlign: 'bottom', paddingRight: 20 }}>
                <div style={{ borderTop: '1px solid #111827', paddingTop: 4, width: '85%' }}>
                  <div style={{ fontWeight: 600 }}>{hrName}</div>
                  <div style={{ color: '#6b7280' }}>HR Department</div>
                </div>
              </td>
              <td style={{ width: '50%', verticalAlign: 'bottom', paddingLeft: 20 }}>
                <div style={{ borderTop: '1px solid #111827', paddingTop: 4, width: '85%' }}>
                  <div style={{ fontWeight: 600 }}>Syed Asghar</div>
                  <div style={{ color: '#6b7280' }}>Chief Executive Officer</div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <p style={{
          marginTop: 36, fontSize: 10, color: '#6b7280',
          textAlign: 'center', fontStyle: 'italic',
          borderTop: '1px solid #e5e7eb', paddingTop: 10,
        }}>
          System-generated document. For queries, contact hr@convertt.co
        </p>
      </div>
    </>
  )
}

function Row({
  label, value, bold, tone,
}: {
  label: string
  value: string
  bold?: boolean
  tone?: 'positive' | 'negative' | 'neutral'
}) {
  const color =
    tone === 'positive' ? '#047857' :
    tone === 'negative' ? '#b91c1c' :
    '#111827'
  return (
    <tr>
      <td style={{
        padding: '6px 10px',
        width: '38%',
        color: '#4b5563',
        fontWeight: 600,
        verticalAlign: 'top',
        borderBottom: '1px solid #f3f4f6',
      }}>
        {label}
      </td>
      <td style={{
        padding: '6px 10px',
        color,
        fontWeight: bold ? 700 : 400,
        borderBottom: '1px solid #f3f4f6',
      }}>
        {value}
      </td>
    </tr>
  )
}
