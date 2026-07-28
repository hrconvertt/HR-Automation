import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { savePayrollConfig } from '@/lib/config'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  if (!token || !await verifyToken(token)) {
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
    companyName, workingDays,
    // Payroll calculation settings
    standardHoursPerDay, overtimeMultiplier,
    lateThresholdHour, lateThresholdMinute,
    eobiEnabled, eobiEmployeeRate, eobiCap,
    taxEnabled,
  } = body

  if (companyName) {
    await prisma.config.upsert({
      where: { key: 'companyName' },
      update: { value: companyName },
      create: { key: 'companyName', value: companyName },
    })
  }

  if (workingDays) {
    await prisma.config.upsert({
      where: { key: 'workingDays' },
      update: { value: JSON.stringify(workingDays) },
      create: { key: 'workingDays', value: JSON.stringify(workingDays) },
    })
  }

  // Save any payroll config keys that were passed
  const payrollUpdates: Record<string, unknown> = {}
  if (standardHoursPerDay !== undefined) payrollUpdates.standardHoursPerDay = standardHoursPerDay
  if (overtimeMultiplier !== undefined) payrollUpdates.overtimeMultiplier = overtimeMultiplier
  if (lateThresholdHour !== undefined) payrollUpdates.lateThresholdHour = lateThresholdHour
  if (lateThresholdMinute !== undefined) payrollUpdates.lateThresholdMinute = lateThresholdMinute
  if (eobiEnabled !== undefined) payrollUpdates.eobiEnabled = eobiEnabled
  if (eobiEmployeeRate !== undefined) payrollUpdates.eobiEmployeeRate = eobiEmployeeRate
  if (eobiCap !== undefined) payrollUpdates.eobiCap = eobiCap
  if (taxEnabled !== undefined) payrollUpdates.taxEnabled = taxEnabled

  if (Object.keys(payrollUpdates).length > 0) {
    await savePayrollConfig(payrollUpdates as Parameters<typeof savePayrollConfig>[0])
  }

  return NextResponse.json({ success: true })
}
