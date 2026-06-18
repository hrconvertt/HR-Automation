/**
 * Total Rewards — printable A4 CTC statement for an employee.
 *
 * Access: HR_ADMIN or the employee themselves (salary confidentiality).
 * The page auto-fires window.print() once loaded (matches the letters
 * print pattern in /dashboard/letters/[id]).
 *
 * Content is denominated in PKR and structured around Pakistani statutory
 * benefits (EOBI, gratuity, provident fund) plus the time-off value of
 * the employee's current leave entitlement.
 */

import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { TotalRewardsClient } from './total-rewards-client'

interface PageProps {
  params: Promise<{ id: string }>
}

const fmt = (n: number) => `PKR ${Math.round(n).toLocaleString('en-PK')}`

export default async function TotalRewardsPage({ params }: PageProps) {
  const { id } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  if (!user) redirect('/login')

  const previewRole =
    user.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role
  const myEmpId = user.employee?.id ?? null

  const emp = await prisma.employee.findUnique({
    where: { id },
    include: {
      department: { select: { name: true } },
      salary: true,
      leaveBalances: { where: { year: new Date().getFullYear() } },
    },
  })
  if (!emp) notFound()

  const isHR = effectiveRole === 'HR_ADMIN'
  const isOwn = emp.id === myEmpId
  if (!isHR && !isOwn) {
    return (
      <div className="rounded-2xl bg-slate-50 border border-slate-100 p-6">
        <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="text-sm text-slate-900 mt-2">
          Total Rewards statements are confidential. Only HR and the employee can view them.
        </p>
      </div>
    )
  }

  // ── 1. Direct Compensation (annual) ──
  const s = emp.salary
  const basicMonthly  = s?.basic ?? 0
  const hraMonthly    = s?.houseRent ?? 0
  const utilMonthly   = s?.utilities ?? 0
  const foodMonthly   = s?.food ?? 0
  const fuelMonthly   = s?.fuel ?? 0
  const medMonthly    = s?.medicalAllowance ?? 0
  const otherMonthly  = s?.otherAllowance ?? 0
  const grossMonthly  = basicMonthly + hraMonthly + utilMonthly + foodMonthly + fuelMonthly + medMonthly + otherMonthly
  const basicAnnual   = basicMonthly * 12
  const hraAnnual     = hraMonthly * 12
  const utilAnnual    = utilMonthly * 12
  const foodAnnual    = foodMonthly * 12
  const fuelAnnual    = fuelMonthly * 12
  const medAnnual     = medMonthly * 12
  const otherAnnual   = otherMonthly * 12
  // Annual bonus estimate — 1× monthly gross unless we can pull actuals.
  const bonusAnnual   = Math.round(grossMonthly)

  const directTotal = basicAnnual + hraAnnual + utilAnnual + foodAnnual + fuelAnnual + medAnnual + otherAnnual + bonusAnnual

  // ── 2. Statutory Benefits ──
  // EOBI employer contribution — flat PKR 1,500/month at the time of writing
  // (employer share, current Pakistani rate). Cheap to be conservative.
  const EOBI_EMPLOYER_MONTHLY = 1500
  const eobiAnnual = EOBI_EMPLOYER_MONTHLY * 12

  // Gratuity accrual — 1 month basic per year of service (Pakistani standard,
  // only for PERMANENT employees).
  const gratuityAnnual = emp.employeeType === 'PERMANENT' ? basicMonthly : 0

  // Provident fund — Salary table doesn't carry a PF rate; show 0 unless
  // we know one. Kept for symmetry / future use.
  const pfAnnual = 0

  const statutoryTotal = eobiAnnual + gratuityAnnual + pfAnnual

  // ── 3. Time-Off Value ──
  // Per-day rate derived from monthly gross / 22 working days.
  const dailyRate = grossMonthly / 22
  const annualLeaveDays =
    emp.leaveBalances.find((b) => b.leaveType === 'ANNUAL')?.allocated ??
    (emp.employeeType === 'PERMANENT' ? 24 : 0)
  const sickLeaveDays =
    emp.leaveBalances.find((b) => b.leaveType === 'SICK')?.allocated ??
    (emp.employeeType === 'PERMANENT' ? 10 : 0)
  const casualLeaveDays =
    emp.leaveBalances.find((b) => b.leaveType === 'CASUAL')?.allocated ??
    (emp.employeeType === 'PERMANENT' ? 12 : 0)
  const annualLeaveValue = annualLeaveDays * dailyRate
  const sickLeaveValue   = sickLeaveDays * dailyRate
  const casualLeaveValue = casualLeaveDays * dailyRate
  const timeOffTotal = annualLeaveValue + sickLeaveValue + casualLeaveValue

  // ── 4. Other Benefits ──
  // Healthcare reimbursements — already counted as medicalAllowance in direct
  // comp; surface here only when a separate field exists. We leave as 0 to
  // avoid double-counting. Phone/internet allowance not modelled separately.
  const otherBenefitsTotal = 0

  // ── TOTAL CTC ──
  const totalCTC = directTotal + statutoryTotal + timeOffTotal + otherBenefitsTotal
  // Take-home estimate: gross × 12 minus rough 5% tax + EOBI employee share.
  const annualGross = grossMonthly * 12
  const takeHomeApprox = Math.max(0, annualGross - annualGross * 0.05 - 12 * 370)
  const visibilityPct = totalCTC > 0 ? Math.round((takeHomeApprox / totalCTC) * 100) : 0

  return (
    <TotalRewardsClient>
      <div className="trs-doc">
        <style>{`
          @page { size: A4; margin: 14mm; }
          @media print {
            body { background: white !important; }
            .trs-doc { box-shadow: none !important; padding: 0 !important; max-width: none !important; }
            .trs-noprint { display: none !important; }
          }
          .trs-doc {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            padding: 40px 48px;
            box-shadow: 0 1px 4px rgba(0,0,0,.06);
            color: #0f172a;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            font-size: 12.5px;
            line-height: 1.55;
            border-top: 4px solid #1d4ed8;
          }
          .trs-doc h1 { font-size: 22px; margin: 0; }
          .trs-doc h2 {
            font-size: 11px; text-transform: uppercase; letter-spacing: .18em;
            color: #64748b; margin: 28px 0 10px; padding-bottom: 6px;
            border-bottom: 1px solid #f1f5f9;
          }
          .trs-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 18px; border-bottom: 1px solid #e2e8f0; }
          .trs-logo {
            width: 48px; height: 48px; background: #1d4ed8; color: white;
            font-weight: 700; font-size: 20px; border-radius: 8px;
            display: flex; align-items: center; justify-content: center;
          }
          .trs-meta { text-align: right; }
          .trs-meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: .2em; color: #64748b; font-weight: 600; }
          .trs-meta-value { font-size: 18px; font-weight: 700; margin-top: 2px; }
          .trs-meta-ref { font-size: 10px; color: #94a3b8; margin-top: 4px; font-family: monospace; }
          .trs-table { width: 100%; border-collapse: collapse; }
          .trs-table td { padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
          .trs-table tr:last-child td { border-bottom: none; }
          .trs-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
          .trs-row-sub { color: #64748b; font-size: 11.5px; }
          .trs-row-total td {
            border-top: 2px solid #cbd5e1 !important;
            padding-top: 11px !important; font-weight: 700; color: #0f172a;
          }
          .trs-row-total td.num { color: #1d4ed8; font-size: 13.5px; }
          .trs-grand {
            margin-top: 22px; padding: 18px 22px;
            background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px;
            display: flex; justify-content: space-between; align-items: center;
          }
          .trs-grand .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: .18em; color: #1d4ed8; font-weight: 700; }
          .trs-grand .val { font-size: 26px; font-weight: 800; color: #1d4ed8; font-variant-numeric: tabular-nums; }
          .trs-summary {
            margin-top: 18px; padding: 14px 18px;
            background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;
            font-size: 12px; color: #475569; display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap;
          }
          .trs-summary strong { color: #0f172a; }
          .trs-footer { margin-top: 36px; padding-top: 14px; border-top: 1px solid #e2e8f0; font-size: 10.5px; color: #94a3b8; text-align: center; font-style: italic; }
          .trs-info td:first-child { color: #64748b; font-size: 10.5px; text-transform: uppercase; letter-spacing: .1em; font-weight: 600; padding-right: 16px; width: 38%; }
          .trs-info td:last-child { font-weight: 500; }
        `}</style>

        <div className="trs-noprint" style={{ maxWidth: 800, margin: '0 auto 12px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={() => window.print()}
            style={{ padding: '6px 14px', borderRadius: 6, background: '#1d4ed8', color: 'white', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Print / Save as PDF
          </button>
        </div>

        <div className="trs-header">
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div className="trs-logo">C</div>
            <div>
              <h1>Convertt Ltd</h1>
              <p style={{ margin: '4px 0 0', fontSize: 10.5, color: '#64748b', lineHeight: 1.55 }}>
                Office 201, 5th Floor, Mega Tower<br />
                Gulberg Main Boulevard, Lahore, Pakistan<br />
                finance@convertt.co · +92 370 0488685
              </p>
            </div>
          </div>
          <div className="trs-meta">
            <div className="trs-meta-label">Total Rewards Statement</div>
            <div className="trs-meta-value">{new Date().getFullYear()}</div>
            <div className="trs-meta-ref">Generated {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
          </div>
        </div>

        <h2>Employee</h2>
        <table className="trs-table trs-info">
          <tbody>
            <tr>
              <td>Name</td><td>{emp.fullName}</td>
            </tr>
            <tr>
              <td>Employee Code</td><td style={{ fontFamily: 'monospace' }}>{emp.employeeCode}</td>
            </tr>
            <tr>
              <td>Designation</td><td>{emp.designation}</td>
            </tr>
            <tr>
              <td>Department</td><td>{emp.department?.name ?? '—'}</td>
            </tr>
            <tr>
              <td>Joining Date</td>
              <td>{emp.joiningDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</td>
            </tr>
            <tr>
              <td>Employment Type</td><td>{emp.employeeType}</td>
            </tr>
          </tbody>
        </table>

        <h2>1 · Direct Compensation (Annual)</h2>
        <table className="trs-table">
          <tbody>
            <tr><td>Basic Salary (× 12)</td><td className="num">{fmt(basicAnnual)}</td></tr>
            {hraAnnual > 0 && <tr><td>House Rent Allowance (× 12)</td><td className="num">{fmt(hraAnnual)}</td></tr>}
            {medAnnual > 0 && <tr><td>Medical Allowance (× 12)</td><td className="num">{fmt(medAnnual)}</td></tr>}
            {fuelAnnual > 0 && <tr><td>Conveyance / Fuel (× 12)</td><td className="num">{fmt(fuelAnnual)}</td></tr>}
            {utilAnnual > 0 && <tr><td>Utilities (× 12)</td><td className="num">{fmt(utilAnnual)}</td></tr>}
            {foodAnnual > 0 && <tr><td>Food Allowance (× 12)</td><td className="num">{fmt(foodAnnual)}</td></tr>}
            {otherAnnual > 0 && <tr><td>Other Allowances (× 12)</td><td className="num">{fmt(otherAnnual)}</td></tr>}
            <tr><td>Annual Bonus <span className="trs-row-sub">(estimated, 1× monthly gross)</span></td><td className="num">{fmt(bonusAnnual)}</td></tr>
            <tr className="trs-row-total"><td>Subtotal</td><td className="num">{fmt(directTotal)}</td></tr>
          </tbody>
        </table>

        <h2>2 · Statutory Benefits</h2>
        <table className="trs-table">
          <tbody>
            <tr><td>EOBI <span className="trs-row-sub">(employer contribution, PKR 1,500/mo)</span></td><td className="num">{fmt(eobiAnnual)}</td></tr>
            {gratuityAnnual > 0 && (
              <tr><td>Gratuity Accrual <span className="trs-row-sub">(1 month basic / year, PERMANENT only)</span></td><td className="num">{fmt(gratuityAnnual)}</td></tr>
            )}
            {pfAnnual > 0 && (
              <tr><td>Provident Fund <span className="trs-row-sub">(employer)</span></td><td className="num">{fmt(pfAnnual)}</td></tr>
            )}
            <tr className="trs-row-total"><td>Subtotal</td><td className="num">{fmt(statutoryTotal)}</td></tr>
          </tbody>
        </table>

        <h2>3 · Time-Off Value (PKR equivalent)</h2>
        <table className="trs-table">
          <tbody>
            <tr><td>Annual Leave <span className="trs-row-sub">({annualLeaveDays} days × daily rate)</span></td><td className="num">{fmt(annualLeaveValue)}</td></tr>
            <tr><td>Sick Leave <span className="trs-row-sub">({sickLeaveDays} days × daily rate)</span></td><td className="num">{fmt(sickLeaveValue)}</td></tr>
            <tr><td>Casual Leave <span className="trs-row-sub">({casualLeaveDays} days × daily rate)</span></td><td className="num">{fmt(casualLeaveValue)}</td></tr>
            <tr className="trs-row-total"><td>Subtotal</td><td className="num">{fmt(timeOffTotal)}</td></tr>
          </tbody>
        </table>

        {otherBenefitsTotal > 0 && (
          <>
            <h2>4 · Other Benefits</h2>
            <table className="trs-table">
              <tbody>
                <tr className="trs-row-total"><td>Subtotal</td><td className="num">{fmt(otherBenefitsTotal)}</td></tr>
              </tbody>
            </table>
          </>
        )}

        <div className="trs-grand">
          <span className="lbl">Total CTC ({new Date().getFullYear()})</span>
          <span className="val">{fmt(totalCTC)}</span>
        </div>

        <div className="trs-summary">
          <span>Take-home pay (approx): <strong>{fmt(takeHomeApprox)}</strong></span>
          <span>Total CTC: <strong>{fmt(totalCTC)}</strong></span>
          <span>You see ~<strong>{visibilityPct}%</strong> of your full package value on your payslip.</span>
        </div>

        <div className="trs-footer">
          This Total Rewards statement is confidential and intended only for {emp.fullName}.
          All figures are in Pakistani Rupees (PKR). Estimates rely on the current Salary record and standard
          Pakistani statutory rates. Generated by Convertt HR.
        </div>
      </div>
    </TotalRewardsClient>
  )
}
