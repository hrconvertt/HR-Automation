/* eslint-disable */
/**
 * scripts/seed-leave-balances.cjs
 * ────────────────────────────────
 * Seed LeaveBalance rows for the current year based on Convertt's 4-stage
 * lifecycle leave policy:
 *
 *   Training    (2–3 mo)  : 1 emergency / month → max 3 total
 *   Internship  (3 mo)    : 1 emergency / month → 3 total
 *   Probation   (3 mo)    : 2 / month           → 6 total
 *   Permanent   (ongoing) : 3 / month capped 24/year + 1 WFH / month = 12 WFH/year
 *
 * Plus Pakistan statutory (PERMANENT only):
 *   Maternity: 90 days (female)
 *   Paternity: 10 days (male)
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
// per gender for PERMANENT only. Per Convertt's 4-stage lifecycle:
//   TRAINING / INTERNSHIP → 3 emergency leaves total (1/month for up to 3 mo)
//   PROBATION             → 6 leaves (2/month × 3 months)
//   PERMANENT             → 24 (3/month capped at 24) + 12 WFH (1/month)
//
// `WFH` is a string leave type — LeaveBalance.leaveType is a free String
// column so any token is valid. Treat it as a separate balance the
// employee can spend independently from CASUAL.
const POLICY = {
  PERMANENT:  { CASUAL: 24, WFH: 12 },
  PROBATION:  { CASUAL: 6 },
  INTERNSHIP: { CASUAL: 3 },
  // Some imports stored interns as 'INTERN' rather than 'INTERNSHIP' — alias.
  INTERN:     { CASUAL: 3 },
  TRAINING:   { CASUAL: 3 },
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
