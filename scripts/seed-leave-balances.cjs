/* eslint-disable */
/**
 * scripts/seed-leave-balances.cjs
 * ────────────────────────────────
 * Seed LeaveBalance rows for the current year based on Convertt's actual
 * leave policy (read verbatim from the master sheet's "Leave Policy" tab):
 *
 *   Internship          : 1 emergency leave (no regular leaves)
 *   Probation           : 2 per month, 6 total
 *   Permanent Full-time : 3 per month, 24 total (6 with 1 week notice)
 *
 * Plus Pakistan statutory:
 *   Maternity: 90 days (female permanent employees)
 *   Paternity: 10 days (male permanent employees)
 *
 * We split the totals into CASUAL + SICK buckets so the rest of the app's
 * leave-type taxonomy works:
 *   PERMANENT : CASUAL 14 / SICK 10 / (MATERNITY 90 | PATERNITY 10)
 *   PROBATION : CASUAL 4  / SICK 2
 *   INTERNSHIP: CASUAL 1
 *
 * Allocations are pro-rated by joining date for employees who joined mid-year.
 *
 * "used" is computed from APPROVED LeaveRequests in the current year.
 * "remaining" = allocated - used.
 *
 * Idempotent: upserts by (employeeId, year, leaveType).
 *
 * Usage:
 *   DATABASE_URL=… node scripts/seed-leave-balances.cjs
 *
 * Optional:
 *   SEED_LEAVE_YEAR=2026   override target year (defaults to current year)
 *   SEED_LEAVE_EMPLOYEE=<id>  only seed for one employee
 */

const { PrismaClient } = require('@prisma/client')

const YEAR = parseInt(process.env.SEED_LEAVE_YEAR || String(new Date().getFullYear()), 10)
const ONLY_EMP = process.env.SEED_LEAVE_EMPLOYEE || null

// Per-employee-type policy (full-year allocations). Maternity/Paternity added
// per gender for PERMANENT only.
const POLICY = {
  PERMANENT:  { CASUAL: 14, SICK: 10 },
  PROBATION:  { CASUAL: 4,  SICK: 2 },
  INTERNSHIP: { CASUAL: 1 },
  // TRAINING — treat like INTERNSHIP
  TRAINING:   { CASUAL: 1 },
}

function prorate(fullYearDays, joiningDate, year) {
  if (!joiningDate) return fullYearDays
  const join = new Date(joiningDate)
  // If joined before the start of this year, full allocation
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const yearEnd   = new Date(Date.UTC(year, 11, 31))
  if (join.getTime() <= yearStart.getTime()) return fullYearDays
  if (join.getTime() > yearEnd.getTime()) return 0
  // Pro-rate by remaining months (inclusive)
  const monthsRemaining = 12 - join.getUTCMonth()
  const value = (fullYearDays * monthsRemaining) / 12
  // Round to nearest half (matches half-day leave granularity)
  return Math.round(value * 2) / 2
}

async function main() {
  const prisma = new PrismaClient()

  // Wake Neon
  for (let i = 1; i <= 10; i++) {
    try { await prisma.$queryRaw`SELECT 1`; break }
    catch (e) {
      if (i === 10) throw e
      console.log(`Waking Neon… ${i}/10`)
      await new Promise(r => setTimeout(r, 4000))
    }
  }

  const where = {
    status: { in: ['ACTIVE', 'PROBATION', 'ON_LEAVE'] },
    ...(ONLY_EMP ? { id: ONLY_EMP } : {}),
  }
  const employees = await prisma.employee.findMany({
    where,
    select: {
      id: true, fullName: true, employeeType: true, gender: true,
      joiningDate: true, status: true,
    },
    orderBy: { fullName: 'asc' },
  })

  console.log(`Seeding LeaveBalance for ${employees.length} employee(s), year ${YEAR}…`)
  console.log('═'.repeat(70))

  let upserts = 0
  const yearStart = new Date(Date.UTC(YEAR, 0, 1))
  const yearEnd   = new Date(Date.UTC(YEAR, 11, 31, 23, 59, 59))

  for (const emp of employees) {
    const empType = emp.employeeType || 'PROBATION'
    const base = POLICY[empType] || POLICY.PROBATION
    const allocations = { ...base }

    // Add gender-specific statutory leave for PERMANENT only
    if (empType === 'PERMANENT') {
      const g = String(emp.gender || '').toUpperCase()
      if (g.startsWith('F')) allocations.MATERNITY = 90
      else if (g.startsWith('M')) allocations.PATERNITY = 10
    }

    // Pull APPROVED leave requests for this employee in target year, sum days by type
    const approved = await prisma.leaveRequest.findMany({
      where: {
        employeeId: emp.id,
        status: 'APPROVED',
        fromDate: { lte: yearEnd },
        toDate:   { gte: yearStart },
      },
      select: { leaveType: true, days: true },
    })
    const usedByType = {}
    for (const r of approved) {
      const k = String(r.leaveType || '').toUpperCase()
      usedByType[k] = (usedByType[k] || 0) + (r.days || 0)
    }

    const parts = []
    for (const [leaveType, fullYear] of Object.entries(allocations)) {
      const allocated = prorate(fullYear, emp.joiningDate, YEAR)
      const used = usedByType[leaveType] || 0
      const remaining = Math.max(0, allocated - used)

      await prisma.leaveBalance.upsert({
        where: { employeeId_year_leaveType: { employeeId: emp.id, year: YEAR, leaveType } },
        create: { employeeId: emp.id, year: YEAR, leaveType, allocated, used, remaining, pending: 0 },
        update: { allocated, used, remaining },
      })
      upserts++
      parts.push(`${leaveType} ${allocated} (used ${used}, remaining ${remaining})`)
    }

    console.log(`${emp.fullName} [${empType}]: ${parts.join(' · ')}`)
  }

  console.log('═'.repeat(70))
  console.log(`Done. ${upserts} LeaveBalance row(s) upserted for ${employees.length} employee(s).`)

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
