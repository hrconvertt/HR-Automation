/**
 * Library version of scripts/seed-leave-balances.cjs.
 * Called from the User Management "Invite Employee" flow so a new hire
 * gets their LeaveBalance rows seeded the moment HR sends the invite.
 *
 * Mirrors Convertt's 4-stage lifecycle leave policy (see the .cjs for the
 * full description).
 */
import { prisma } from '@/lib/prisma'

const POLICY: Record<string, Record<string, number>> = {
  PERMANENT: { CASUAL: 24, WFH: 12 },
  PROBATION: { CASUAL: 6 },
  INTERNSHIP: { CASUAL: 3 },
  INTERN: { CASUAL: 3 },
  TRAINING: { CASUAL: 3 },
}

function prorate(fullYearDays: number, joiningDate: Date | null, year: number): number {
  if (!joiningDate) return fullYearDays
  const join = new Date(joiningDate)
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const yearEnd = new Date(Date.UTC(year, 11, 31))
  if (join.getTime() <= yearStart.getTime()) return fullYearDays
  if (join.getTime() > yearEnd.getTime()) return 0
  const monthsRemaining = 12 - join.getUTCMonth()
  const value = (fullYearDays * monthsRemaining) / 12
  return Math.round(value * 2) / 2
}

export async function seedInitialLeaveBalances(employeeId: string, year?: number): Promise<number> {
  const Y = year ?? new Date().getFullYear()
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, employeeType: true, gender: true, joiningDate: true },
  })
  if (!emp) return 0

  const empType = emp.employeeType || 'PROBATION'
  const base = POLICY[empType] || POLICY.PROBATION
  const allocations: Record<string, number> = { ...base }
  if (empType === 'PERMANENT') {
    const g = String(emp.gender || '').toUpperCase()
    if (g.startsWith('F')) allocations.MATERNITY = 90
    else if (g.startsWith('M')) allocations.PATERNITY = 10
  }

  let upserts = 0
  for (const [leaveType, fullYear] of Object.entries(allocations)) {
    const allocated = prorate(fullYear, emp.joiningDate, Y)
    await prisma.leaveBalance.upsert({
      where: { employeeId_year_leaveType: { employeeId: emp.id, year: Y, leaveType } },
      create: {
        employeeId: emp.id,
        year: Y,
        leaveType,
        allocated,
        used: 0,
        remaining: allocated,
        pending: 0,
      },
      update: { allocated, remaining: allocated },
    })
    upserts++
  }
  return upserts
}
