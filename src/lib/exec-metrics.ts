/**
 * CEO-facing executive metrics — focused on signals, not counts.
 *
 * Every metric here answers a strategic question:
 *   - Cost of People % of revenue → "are we still healthy on margin?"
 *   - Revenue per Employee → "is productivity scaling?"
 *   - Voluntary attrition (12mo rolling) → "are we losing people we don't want to lose?"
 *   - Time-to-Hire → "how fast can we grow?"
 *   - Flight Risk count → "who do we need to protect?"
 *   - Manager Span max → "any team manager stretched too thin?"
 *
 * Returns nullable values when underlying data isn't available — the UI
 * shows a "Not configured" hint rather than a misleading zero.
 */
import { prisma } from './prisma'

export interface ExecMetrics {
  // Headline
  headcount: number
  monthlyPayrollCost: number
  monthlyRevenue: number | null
  costOfPeoplePct: number | null     // payroll / revenue * 100
  revenuePerEmployee: number | null  // revenue / headcount

  // Health
  voluntaryAttritionPct12mo: number  // % of active workforce that voluntarily left over the last 12 months
  attritionTrendPp: number | null    // change vs. the prior 12 months in percentage points (null when no prior history)
  timeToHireMedianDays: number | null
  flightRiskCount: number
  flightRiskNames: string[]          // top 5 at risk

  // Structure
  maxSpanOfControl: number
  stretchedManagers: { name: string; reports: number }[] // managers with >7 reports

  // Drill-down material the page may render
  deptHealth: { dept: string; headcount: number; attrition12mo: number; openRoles: number; tone: 'good' | 'watch' | 'red' }[]
}

export async function computeExecMetrics(): Promise<ExecMetrics> {
  const now = new Date()
  const twelveMonthsAgo = new Date(now.getTime() - 365 * 86400_000)
  const twentyFourMonthsAgo = new Date(now.getTime() - 2 * 365 * 86400_000)

  // ─── Headcount ─────────────────────────────────────────────────
  const activeEmps = await prisma.employee.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true, fullName: true, joiningDate: true,
      reportingManagerId: true,
      department: { select: { name: true } },
      salary: { select: { basic: true, houseRent: true, utilities: true, food: true, fuel: true, medicalAllowance: true, otherAllowance: true } },
      performanceReviews: { select: { overallRating: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      compensationHistory: { select: { effectiveDate: true }, orderBy: { effectiveDate: 'desc' }, take: 1 },
    },
  })
  const headcount = activeEmps.length

  // ─── Monthly payroll cost (sum of gross from current/latest salary) ───
  const monthlyPayrollCost = activeEmps.reduce((s, e) => {
    if (!e.salary) return s
    return s + e.salary.basic + e.salary.houseRent + e.salary.utilities +
      e.salary.food + e.salary.fuel + e.salary.medicalAllowance + e.salary.otherAllowance
  }, 0)

  // ─── Monthly revenue (HR enters; latest available month) ───────
  const latestRevenue = await prisma.monthlyMetric.findFirst({
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  })
  const monthlyRevenue = latestRevenue?.revenue ?? null

  const costOfPeoplePct = (monthlyRevenue && monthlyRevenue > 0)
    ? (monthlyPayrollCost / monthlyRevenue) * 100
    : null
  const revenuePerEmployee = (monthlyRevenue && headcount > 0)
    ? monthlyRevenue / headcount
    : null

  // ─── Voluntary attrition (12mo rolling) ────────────────────────
  // CEO-relevant attrition = people who CHOSE to leave (VOLUNTARY), not contract endings.
  const voluntaryExits12mo = await prisma.employee.count({
    where: {
      exitDate: { gte: twelveMonthsAgo },
      terminationType: 'VOLUNTARY',
    },
  })
  const voluntaryExitsPrior12mo = await prisma.employee.count({
    where: {
      exitDate: { gte: twentyFourMonthsAgo, lt: twelveMonthsAgo },
      terminationType: 'VOLUNTARY',
    },
  })
  // Average workforce size during the period (rough — uses current headcount as proxy).
  // Honest formula would average start-of-month headcount over the 12 months.
  const avgWorkforce = Math.max(headcount, 1)
  const voluntaryAttritionPct12mo = (voluntaryExits12mo / avgWorkforce) * 100
  const priorAttritionPct = (voluntaryExitsPrior12mo / avgWorkforce) * 100
  const attritionTrendPp = voluntaryExitsPrior12mo > 0
    ? voluntaryAttritionPct12mo - priorAttritionPct
    : null

  // ─── Time-to-Hire (median days from requisition.postedDate → offer.createdAt) ───
  const filledReqs = await prisma.jobRequisition.findMany({
    where: {
      status: { in: ['FILLED', 'OPEN', 'CLOSED'] },
      postedDate: { not: null, gte: twelveMonthsAgo },
    },
    select: {
      postedDate: true,
      candidates: { select: { offer: { select: { createdAt: true, status: true } } } },
    },
  })
  const cycles: number[] = []
  for (const r of filledReqs) {
    if (!r.postedDate) continue
    const acceptedOffer = r.candidates
      .flatMap((c) => c.offer ? [c.offer] : [])
      .find((o) => o.status === 'ACCEPTED' || o.status === 'PENDING')
    if (!acceptedOffer) continue
    const days = Math.round((acceptedOffer.createdAt.getTime() - r.postedDate.getTime()) / 86400_000)
    if (days >= 0 && days < 365) cycles.push(days)
  }
  const timeToHireMedianDays = cycles.length > 0
    ? cycles.sort((a, b) => a - b)[Math.floor(cycles.length / 2)]
    : null

  // ─── Flight Risk ────────────────────────────────────────────────
  // Definition: ACTIVE + last performance review rating >= 4 (top tier)
  //   AND last comp increase was >18 months ago (or never)
  //   AND tenure >18 months (so it's not a fresh hire)
  const eighteenMonthsAgo = new Date(now.getTime() - 18 * 30 * 86400_000)
  const flightRisks = activeEmps.filter((e) => {
    const review = e.performanceReviews[0]
    if (!review || (review.overallRating ?? 0) < 4) return false
    const lastComp = e.compensationHistory[0]?.effectiveDate ?? e.joiningDate
    if (lastComp > eighteenMonthsAgo) return false
    if (e.joiningDate > eighteenMonthsAgo) return false
    return true
  })
  const flightRiskNames = flightRisks.slice(0, 5).map((e) => e.fullName)

  // ─── Span of control (max + stretched list) ────────────────────
  const directReportCounts = new Map<string, number>()
  for (const e of activeEmps) {
    if (e.reportingManagerId) {
      directReportCounts.set(e.reportingManagerId, (directReportCounts.get(e.reportingManagerId) ?? 0) + 1)
    }
  }
  const maxSpanOfControl = directReportCounts.size > 0 ? Math.max(...directReportCounts.values()) : 0
  const empById = new Map(activeEmps.map((e) => [e.id, e.fullName]))
  const stretchedManagers = Array.from(directReportCounts.entries())
    .filter(([_, c]) => c > 7)
    .map(([id, c]) => ({ name: empById.get(id) ?? 'Unknown', reports: c }))
    .sort((a, b) => b.reports - a.reports)

  // ─── Department health heatmap ─────────────────────────────────
  const deptGroups = new Map<string, number>()
  for (const e of activeEmps) {
    const k = e.department?.name ?? 'No department'
    deptGroups.set(k, (deptGroups.get(k) ?? 0) + 1)
  }
  const deptExits12mo = await prisma.employee.findMany({
    where: { exitDate: { gte: twelveMonthsAgo }, terminationType: 'VOLUNTARY' },
    select: { department: { select: { name: true } } },
  })
  const deptExitCounts = new Map<string, number>()
  for (const e of deptExits12mo) {
    const k = e.department?.name ?? 'No department'
    deptExitCounts.set(k, (deptExitCounts.get(k) ?? 0) + 1)
  }
  const openReqs = await prisma.jobRequisition.groupBy({
    by: ['departmentId'], where: { status: 'OPEN' }, _count: true,
  })
  const depts = await prisma.department.findMany({ select: { id: true, name: true } })
  const deptIdToName = new Map(depts.map((d) => [d.id, d.name]))
  const openRolesByDept = new Map<string, number>()
  for (const r of openReqs) {
    const name = r.departmentId ? deptIdToName.get(r.departmentId) ?? 'Other' : 'Other'
    openRolesByDept.set(name, (openRolesByDept.get(name) ?? 0) + (r._count as unknown as number))
  }
  const deptHealth = Array.from(deptGroups.entries())
    .map(([dept, hc]) => {
      const attrCount = deptExitCounts.get(dept) ?? 0
      const attrPct = (attrCount / Math.max(hc, 1)) * 100
      const openRoles = openRolesByDept.get(dept) ?? 0
      let tone: 'good' | 'watch' | 'red' = 'good'
      if (attrPct > 25 || openRoles >= 3) tone = 'red'
      else if (attrPct > 10 || openRoles >= 1) tone = 'watch'
      return { dept, headcount: hc, attrition12mo: Math.round(attrPct * 10) / 10, openRoles, tone }
    })
    .sort((a, b) => b.headcount - a.headcount)

  return {
    headcount,
    monthlyPayrollCost,
    monthlyRevenue,
    costOfPeoplePct,
    revenuePerEmployee,
    voluntaryAttritionPct12mo,
    attritionTrendPp,
    timeToHireMedianDays,
    flightRiskCount: flightRisks.length,
    flightRiskNames,
    maxSpanOfControl,
    stretchedManagers,
    deptHealth,
  }
}
