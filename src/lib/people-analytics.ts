/**
 * People Analytics — Overview.
 *
 * The HR reading of a CEO dashboard: how many people we have and where that
 * is heading, what they cost, who is choosing to leave, and which HR items
 * are overdue. Everything comes from data the app already keeps; nothing
 * here is typed in for the dashboard's sake.
 *
 * Headcount is counted from joining and exit dates, month by month, so the
 * trend and the attrition rate share one definition of "on the books".
 * Someone marked as departed with no exit date can't be placed on the
 * timeline, so they are left out of the history rather than counted forever.
 */
import { prisma } from './prisma'
import { OPEN_CASE_STATUSES } from './help-center'

const CURRENT_STATUSES = ['ACTIVE', 'PROBATION', 'ON_LEAVE']
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface MonthPoint { label: string; year: number; month: number; value: number | null }

export interface PeopleOverview {
  asOf: Date
  headcount: number
  joined12mo: number
  left12mo: number
  openRoles: number
  voluntaryAttritionPct: number | null
  priorVoluntaryAttritionPct: number | null
  voluntaryLeavers12mo: number
  monthlySalaryBillPkr: number
  peopleOnPkrSalary: number
  aedSalaryBill: number
  peopleOnAedSalary: number
  peopleWithoutSalary: number
  headcountTrend: MonthPoint[]
  payrollTrend: MonthPoint[]
  departments: { name: string; headcount: number; salaryBillPkr: number }[]
  attention: { key: string; label: string; count: number; href: string; action: string }[]
}

function monthEnd(year: number, month0: number): Date {
  return new Date(Date.UTC(year, month0 + 1, 0, 23, 59, 59))
}

export async function computePeopleOverview(): Promise<PeopleOverview> {
  const now = new Date()
  const yearAgo = new Date(now.getTime() - 365 * 86400_000)
  const twoYearsAgo = new Date(now.getTime() - 2 * 365 * 86400_000)
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  const [people, openRoles, probationDue, leaveWithManager, leaveWithHr, openCases, runs] = await Promise.all([
    prisma.employee.findMany({
      where: { deletedAt: null },
      select: {
        joiningDate: true, exitDate: true, status: true, terminationType: true,
        department: { select: { name: true } },
        salary: {
          select: {
            currency: true, basic: true, houseRent: true, utilities: true,
            food: true, fuel: true, medicalAllowance: true, otherAllowance: true,
          },
        },
      },
    }),
    prisma.jobRequisition.count({ where: { status: 'OPEN' } }),
    prisma.probationRecord.count({
      where: {
        status: { in: ['ACTIVE', 'UNDER_REVIEW'] },
        endDate: { lt: today },
        employee: { deletedAt: null, status: { in: CURRENT_STATUSES } },
      },
    }),
    prisma.leaveRequest.count({ where: { status: 'PENDING', employee: { deletedAt: null } } }),
    prisma.leaveRequest.count({ where: { status: 'PENDING_HR', employee: { deletedAt: null } } }),
    prisma.helpDeskTicket.count({ where: { status: { in: OPEN_CASE_STATUSES } } }),
    prisma.payrollRun.findMany({
      where: { status: { notIn: ['DRAFT', 'REJECTED'] } },
      select: { year: true, month: true, totalGross: true },
    }),
  ])

  const departed = (p: (typeof people)[number]) => !CURRENT_STATUSES.includes(p.status)
  const onBooks = (p: (typeof people)[number], at: Date) => {
    if (p.joiningDate > at) return false
    if (p.exitDate) return p.exitDate > at
    return !departed(p)
  }

  // ─── Current workforce ──────────────────────────────────────────
  const current = people.filter((p) => !departed(p) && p.joiningDate <= now)
  const headcount = current.length
  const joined12mo = people.filter((p) => p.joiningDate > yearAgo && p.joiningDate <= now).length
  const left12mo = people.filter((p) => p.exitDate && p.exitDate > yearAgo && p.exitDate <= now).length

  // ─── Headcount trend: the 11 previous month-ends, then today ────
  const headcountTrend: MonthPoint[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const y = d.getUTCFullYear(), m = d.getUTCMonth()
    const at = i === 0 ? now : monthEnd(y, m)
    headcountTrend.push({
      label: MONTH[m], year: y, month: m + 1,
      value: people.filter((p) => onBooks(p, at)).length,
    })
  }

  // ─── Voluntary attrition: leavers ÷ average headcount ───────────
  const avgHeadcount = (from: Date) => {
    let sum = 0
    for (let i = 0; i < 12; i++) {
      const d = new Date(from.getTime() + (i + 1) * 30.4 * 86400_000)
      sum += people.filter((p) => onBooks(p, d)).length
    }
    return sum / 12
  }
  const voluntaryIn = (from: Date, to: Date) => people.filter((p) =>
    p.terminationType === 'VOLUNTARY' && p.exitDate && p.exitDate > from && p.exitDate <= to).length
  const voluntaryLeavers12mo = voluntaryIn(yearAgo, now)
  const avgNow = avgHeadcount(yearAgo)
  const avgPrior = avgHeadcount(twoYearsAgo)
  const voluntaryAttritionPct = avgNow > 0 ? (voluntaryLeavers12mo / avgNow) * 100 : null
  const priorLeavers = voluntaryIn(twoYearsAgo, yearAgo)
  const priorVoluntaryAttritionPct = avgPrior >= 1 ? (priorLeavers / avgPrior) * 100 : null

  // ─── Salary bill, by currency and department ────────────────────
  // Salaries are held in PKR or AED. There's no exchange rate in the app, so
  // AED is reported beside the PKR figure, never added into it.
  const gross = (s: NonNullable<(typeof people)[number]['salary']>) =>
    s.basic + s.houseRent + s.utilities + s.food + s.fuel + s.medicalAllowance + s.otherAllowance
  let monthlySalaryBillPkr = 0, aedSalaryBill = 0, peopleOnPkrSalary = 0, peopleOnAedSalary = 0, peopleWithoutSalary = 0
  const deptMap = new Map<string, { headcount: number; salaryBillPkr: number }>()
  for (const p of current) {
    const name = p.department?.name ?? 'No department'
    const row = deptMap.get(name) ?? { headcount: 0, salaryBillPkr: 0 }
    row.headcount++
    if (!p.salary) peopleWithoutSalary++
    else if (p.salary.currency === 'AED') { aedSalaryBill += gross(p.salary); peopleOnAedSalary++ }
    else { const g = gross(p.salary); monthlySalaryBillPkr += g; row.salaryBillPkr += g; peopleOnPkrSalary++ }
    deptMap.set(name, row)
  }
  const departments = Array.from(deptMap.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.salaryBillPkr - a.salaryBillPkr || b.headcount - a.headcount)

  // ─── Gross payroll by month (runs past draft, every run type) ───
  const payrollByMonth = new Map<string, number>()
  for (const r of runs) {
    const k = `${r.year}-${r.month}`
    payrollByMonth.set(k, (payrollByMonth.get(k) ?? 0) + r.totalGross)
  }
  const payrollTrend: MonthPoint[] = headcountTrend.map((h) => ({
    ...h, value: payrollByMonth.get(`${h.year}-${h.month}`) ?? null,
  }))

  const attention = [
    { key: 'probation', label: 'Probation ended, no decision recorded', count: probationDue, href: '/dashboard/probation', action: 'Open probation' },
    { key: 'leave-manager', label: 'Leave waiting for the manager', count: leaveWithManager, href: '/dashboard/leave/requests', action: 'Open leave requests' },
    { key: 'leave-hr', label: 'Leave waiting for HR sign-off', count: leaveWithHr, href: '/dashboard/leave/requests', action: 'Open leave requests' },
    { key: 'cases', label: 'Help cases still open', count: openCases, href: '/dashboard/help/case-management', action: 'Open case management' },
    { key: 'roles', label: 'Open roles being hired for', count: openRoles, href: '/dashboard/recruiting', action: 'Open recruiting' },
  ]

  return {
    asOf: now,
    headcount, joined12mo, left12mo, openRoles,
    voluntaryAttritionPct, priorVoluntaryAttritionPct, voluntaryLeavers12mo,
    monthlySalaryBillPkr, peopleOnPkrSalary, aedSalaryBill, peopleOnAedSalary, peopleWithoutSalary,
    headcountTrend, payrollTrend, departments, attention,
  }
}
