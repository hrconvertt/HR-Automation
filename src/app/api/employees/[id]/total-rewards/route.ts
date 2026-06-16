/**
 * Total Rewards statement — Workday's "Total Rewards" download equivalent.
 *
 * Returns a self-contained print-ready HTML file the user can save as PDF
 * via the browser print dialog. Includes:
 *   - Current pay components + gross monthly + annual
 *   - Compensation history (last 5 changes)
 *   - YTD payroll totals (gross, tax paid, EOBI, net)
 *
 * Access mirrors the Compensation tab:
 *   HR_ADMIN / EXECUTIVE / FINANCE → any employee
 *   MANAGER                        → own + direct reports
 *   EMPLOYEE                       → own only
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

interface RouteParams { params: Promise<{ id: string }> }

const fmtMoney = (n: number) => `PKR ${Math.round(n).toLocaleString('en-PK')}`
const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

export async function GET(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const previewRole = request.cookies.get('hr_preview_role')?.value
  const effectiveRole = previewRole ?? user.role
  const myEmpId = user.employee?.id ?? null

  const target = await prisma.employee.findUnique({
    where: { id },
    include: {
      department: { select: { name: true } },
      salary: true,
      compensationHistory: {
        orderBy: { effectiveDate: 'desc' },
        take: 5,
      },
    },
  })
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Access check — salary confidentiality. Allowed: HR_ADMIN, EXECUTIVE,
  // FINANCE, or the employee viewing their own statement. Managers/Leads
  // explicitly cannot see compensation, even for their direct reports.
  const { canSeeSalary } = await import('@/lib/can-see-salary')
  const allowed = canSeeSalary({
    viewerRole: effectiveRole,
    viewerEmployeeId: myEmpId,
    targetEmployeeId: target.id,
  })
  if (!allowed) {
    try {
      await prisma.auditLog.create({
        data: {
          userId: payload.userId,
          employeeId: target.id,
          action: 'READ',
          entity: 'TotalRewards',
          entityId: target.id,
          newValue: JSON.stringify({ blocked: true, role: effectiveRole }),
        },
      })
    } catch { /* ignore audit failure */ }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // YTD totals
  const currentYear = new Date().getFullYear()
  const ytdSlips = await prisma.payslip.findMany({
    where: { employeeId: id, year: currentYear, status: { in: ['PAID', 'APPROVED'] } },
  })
  const ytd = ytdSlips.reduce(
    (acc, p) => ({
      gross: acc.gross + p.grossSalary,
      tax: acc.tax + p.incomeTax,
      eobi: acc.eobi + p.eobi,
      net: acc.net + p.netSalary,
    }),
    { gross: 0, tax: 0, eobi: 0, net: 0 },
  )

  const s = target.salary
  const grossMonthly = s
    ? s.basic + s.houseRent + s.utilities + s.food + s.fuel + s.medicalAllowance + s.otherAllowance
    : 0
  const annualGross = grossMonthly * 12

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Total Rewards — ${escape(target.fullName)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 0; padding: 32px; background: #f8fafc; }
  .doc { max-width: 800px; margin: 0 auto; background: white; padding: 48px; box-shadow: 0 1px 3px rgba(0,0,0,.08); border-top: 4px solid #1d4ed8; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.2em; color: #64748b; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #f1f5f9; }
  .header { display: flex; justify-content: space-between; padding-bottom: 24px; border-bottom: 1px solid #e2e8f0; }
  .logo { display: flex; gap: 14px; align-items: flex-start; }
  .logo-box { width: 52px; height: 52px; background: #1d4ed8; color: white; font-weight: 700; font-size: 22px; border-radius: 6px; display: flex; align-items: center; justify-content: center; }
  .meta { text-align: right; }
  .meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.2em; color: #64748b; font-weight: 600; }
  .meta-value { font-size: 18px; font-weight: 700; margin-top: 4px; }
  .meta-ref { font-size: 10px; color: #94a3b8; margin-top: 6px; font-family: monospace; letter-spacing: 0.05em; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.detail td { padding: 8px 0; vertical-align: top; }
  table.detail .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; font-weight: 600; }
  table.detail .val { color: #0f172a; font-weight: 500; }
  table.detail tr td { width: 50%; padding-right: 24px; }
  table.lines td { padding: 9px 0; border-bottom: 1px solid #f1f5f9; }
  table.lines tr:last-child td { border-bottom: none; }
  table.lines td:nth-child(2) { text-align: right; font-variant-numeric: tabular-nums; }
  .total-row td { border-top: 2px solid #cbd5e1 !important; padding-top: 12px !important; font-weight: 700; }
  .total-row td:nth-child(2) { color: #1d4ed8; font-size: 15px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .kpi { border: 1px solid #e2e8f0; padding: 14px; border-radius: 8px; }
  .kpi-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; font-weight: 600; }
  .kpi-value { font-size: 18px; font-weight: 700; margin-top: 6px; font-variant-numeric: tabular-nums; }
  table.history th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; font-weight: 600; text-align: left; padding-bottom: 10px; border-bottom: 1px solid #e2e8f0; }
  table.history td { padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
  table.history td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 600; background: #f1f5f9; color: #475569; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; font-style: italic; }
  @media print { body { background: white; padding: 0; } .doc { box-shadow: none; padding: 32px; } }
</style>
</head>
<body>
  <div class="doc">

    <!-- Header -->
    <div class="header">
      <div class="logo">
        <div class="logo-box">C</div>
        <div>
          <h1>Convertt Ltd</h1>
          <p style="margin:4px 0 0;font-size:11px;color:#64748b;line-height:1.6">
            Office 201, 5th Floor, Mega Tower<br>
            Gulberg Main Boulevard, Lahore, Pakistan<br>
            finance@convertt.co · +92 370 0488685
          </p>
        </div>
      </div>
      <div class="meta">
        <div class="meta-label">Total Rewards Statement</div>
        <div class="meta-value">${currentYear}</div>
        <div class="meta-ref">Generated ${fmtDate(new Date())}</div>
      </div>
    </div>

    <!-- Employee -->
    <h2>Employee Information</h2>
    <table class="detail">
      <tr>
        <td><div class="lbl">Employee Name</div><div class="val">${escape(target.fullName)}</div></td>
        <td><div class="lbl">Employee ID</div><div class="val">${escape(target.employeeCode)}</div></td>
      </tr>
      <tr>
        <td><div class="lbl">Designation</div><div class="val">${escape(target.designation)}</div></td>
        <td><div class="lbl">Department</div><div class="val">${escape(target.department?.name ?? '—')}</div></td>
      </tr>
      <tr>
        <td><div class="lbl">Type of Employment</div><div class="val">${escape(target.employeeType)}</div></td>
        <td><div class="lbl">Date of Joining</div><div class="val">${fmtDate(target.joiningDate)}</div></td>
      </tr>
    </table>

    <!-- Current pay -->
    <h2>Current Compensation</h2>
    ${!s ? '<p style="font-size:13px;color:#94a3b8;font-style:italic">No salary record on file.</p>' : `
    <table class="lines">
      <tr><td>Basic Salary</td><td>${fmtMoney(s.basic)}</td></tr>
      <tr><td>House Rent</td><td>${fmtMoney(s.houseRent)}</td></tr>
      <tr><td>Utilities</td><td>${fmtMoney(s.utilities)}</td></tr>
      <tr><td>Food Allowance</td><td>${fmtMoney(s.food)}</td></tr>
      <tr><td>Fuel Allowance</td><td>${fmtMoney(s.fuel)}</td></tr>
      <tr><td>Medical Allowance</td><td>${fmtMoney(s.medicalAllowance)}</td></tr>
      <tr><td>Other Allowances</td><td>${fmtMoney(s.otherAllowance)}</td></tr>
      <tr class="total-row"><td>Monthly Gross</td><td>${fmtMoney(grossMonthly)}</td></tr>
    </table>
    <div class="kpis" style="margin-top:24px">
      <div class="kpi"><div class="kpi-label">Annual Gross</div><div class="kpi-value">${fmtMoney(annualGross)}</div></div>
      <div class="kpi"><div class="kpi-label">YTD Gross Paid</div><div class="kpi-value">${fmtMoney(ytd.gross)}</div></div>
      <div class="kpi"><div class="kpi-label">YTD Income Tax</div><div class="kpi-value">${fmtMoney(ytd.tax)}</div></div>
      <div class="kpi"><div class="kpi-label">YTD Net Pay</div><div class="kpi-value">${fmtMoney(ytd.net)}</div></div>
    </div>
    `}

    <!-- History -->
    <h2>Recent Compensation Changes</h2>
    ${target.compensationHistory.length === 0 ? '<p style="font-size:13px;color:#94a3b8;font-style:italic">No prior changes recorded.</p>' : `
    <table class="history">
      <thead><tr>
        <th>Effective</th><th>Type</th>
        <th style="text-align:right">Previous</th>
        <th style="text-align:right">New</th>
        <th style="text-align:right">Change</th>
      </tr></thead>
      <tbody>
        ${target.compensationHistory.map((c) => {
          const diff = c.newSalary - c.oldSalary
          return `<tr>
            <td>${fmtDate(c.effectiveDate)}</td>
            <td><span class="badge">${escape(c.type)}</span></td>
            <td class="num">${c.oldSalary > 0 ? fmtMoney(c.oldSalary) : '—'}</td>
            <td class="num"><strong>${fmtMoney(c.newSalary)}</strong></td>
            <td class="num" style="color:${diff >= 0 ? '#059669' : '#dc2626'};font-weight:600">${diff > 0 ? '+' : ''}${fmtMoney(diff)}${c.incrementPct != null ? ` (${c.incrementPct.toFixed(1)}%)` : ''}</td>
          </tr>`
        }).join('')}
      </tbody>
    </table>
    `}

    <div class="footer">
      This Total Rewards statement is confidential and intended only for ${escape(target.fullName)}.
      All figures are in Pakistani Rupees (PKR). Generated by Convertt HR.
    </div>
  </div>
</body>
</html>`.trim()

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="total-rewards-${target.employeeCode}-${currentYear}.html"`,
    },
  })
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
