import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { savePayrollConfig } from '@/lib/config'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  // verifyToken() resolves the Clerk session first and only falls back to
  // the hr_token cookie, so gating on that cookie 401s every Clerk-signed-in
  // user before the check even runs. Ask verifyToken directly.
  if (!await verifyToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [departments, positions, leavePolicies, configs] = await Promise.all([
    prisma.department.findMany({ orderBy: { code: 'asc' } }),
    prisma.position.findMany({ orderBy: { level: 'asc' } }),
    prisma.leavePolicy.findMany({ orderBy: [{ employeeType: 'asc' }, { leaveType: 'asc' }] }),
    prisma.config.findMany(),
  ])

  const config: Record<string, string> = {}
  for (const c of configs) { config[c.key] = c.value }

  return NextResponse.json({ departments, positions, leavePolicies, config })
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasRole(payload, 'HR_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to perform this action' }, { status: 403 })
  }

  const body = await request.json()
  const {
    companyName, workingDays, workDayHours, salaryStructureBasicPct,
    // Which country's working week this save is for. Convertt runs in Pakistan
    // and the UAE (HR Playbook 1.2) and their weeks differ, so the schedule is
    // stored per country. Absent means Pakistan, the default.
    country,
    // Payroll calculation settings
    standardHoursPerDay, overtimeMultiplier,
    lateThresholdHour, lateThresholdMinute,
    eobiEnabled, eobiEmployeeRate, eobiEmployerRate, eobiWageBase, province,
    taxEnabled,
  } = body

  const loc = country === 'UAE' ? 'UAE' : 'PK'

  const upsertKey = async (key: string, value: string) => {
    await prisma.config.upsert({
      where: { key }, update: { value }, create: { key, value },
    })
  }

  if (companyName) await upsertKey('companyName', companyName)

  // Payroll — default Basic share of gross (Salary Structure page).
  if (salaryStructureBasicPct !== undefined) {
    const n = Number(salaryStructureBasicPct)
    const pct = Number.isFinite(n) && n >= 0 && n <= 100 ? n : 60
    await upsertKey('salaryStructure:basicPctOfGross', String(pct))
  }

  if (workingDays) {
    await upsertKey(`workingDays:${loc}`, JSON.stringify(workingDays))
    // Pakistan mirrors the legacy key, so attendance and payroll — which read
    // `workingDays` — keep working while everyone is in Pakistan.
    if (loc === 'PK') await upsertKey('workingDays', JSON.stringify(workingDays))
  }

  // Per-day start/end/break, namespaced the same way.
  if (workDayHours) {
    await upsertKey(`workDayHours:${loc}`, JSON.stringify(workDayHours))
    if (loc === 'PK') await upsertKey('workDayHours', JSON.stringify(workDayHours))
  }

  // Save any payroll config keys that were passed
  const payrollUpdates: Record<string, unknown> = {}
  if (standardHoursPerDay !== undefined) payrollUpdates.standardHoursPerDay = standardHoursPerDay
  if (overtimeMultiplier !== undefined) payrollUpdates.overtimeMultiplier = overtimeMultiplier
  if (lateThresholdHour !== undefined) payrollUpdates.lateThresholdHour = lateThresholdHour
  if (lateThresholdMinute !== undefined) payrollUpdates.lateThresholdMinute = lateThresholdMinute
  if (eobiEnabled !== undefined) payrollUpdates.eobiEnabled = eobiEnabled
  if (eobiEmployeeRate !== undefined) payrollUpdates.eobiEmployeeRate = eobiEmployeeRate
  if (eobiEmployerRate !== undefined) payrollUpdates.eobiEmployerRate = eobiEmployerRate
  if (eobiWageBase !== undefined) payrollUpdates.eobiWageBase = eobiWageBase
  if (province !== undefined) payrollUpdates.province = province
  // The monthly EOBI cap is no longer typed by hand — it is the employee's
  // contribution: wage base × employee rate. Recompute it whenever either
  // input changes, so the value downstream payroll reads stays correct.
  if (eobiWageBase !== undefined || eobiEmployeeRate !== undefined) {
    const base = Number(eobiWageBase)
    const rate = Number(eobiEmployeeRate)
    if (Number.isFinite(base) && Number.isFinite(rate)) {
      payrollUpdates.eobiCap = Math.round(base * rate)
    }
  }
  if (taxEnabled !== undefined) payrollUpdates.taxEnabled = taxEnabled

  if (Object.keys(payrollUpdates).length > 0) {
    await savePayrollConfig(payrollUpdates as Parameters<typeof savePayrollConfig>[0])
  }

  return NextResponse.json({ success: true })
}
