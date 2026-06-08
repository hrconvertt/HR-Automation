/**
 * Self-Heal — system-wide drift detector & fixer.
 *
 * Each check returns:
 *   { id, label, severity, found, sample, autoFix? }
 *
 * `found` is the count of drifted records. `autoFix` (when present) is
 * an async function that resolves the drift and returns how many were
 * fixed. The API surface lets HR scan everything and then opt in to
 * specific fixes — nothing destructive runs without an explicit POST.
 *
 * Checks here are intentionally cheap and idempotent.
 */
import { prisma } from './prisma'

export interface HealthCheck {
  id: string
  label: string
  severity: 'info' | 'warn' | 'crit'
  found: number
  sample?: string[]      // up to 5 names/codes for the UI
  autoFixable: boolean
  description: string
}

export interface HealthReport {
  scannedAt: string
  checks: HealthCheck[]
  totals: { critical: number; warning: number; info: number; healthy: number }
}

// ─── Individual checks ───────────────────────────────────────────────

/** Active employees with no Salary row — AutoPilot would skip them. */
async function checkActiveWithoutSalary(): Promise<HealthCheck> {
  const rows = await prisma.employee.findMany({
    where: { status: 'ACTIVE', salary: null },
    select: { fullName: true, employeeCode: true },
    take: 100,
  })
  return {
    id: 'active_without_salary',
    label: 'Active employees with no salary on file',
    severity: rows.length > 0 ? 'crit' : 'info',
    found: rows.length,
    sample: rows.slice(0, 5).map((r) => `${r.fullName} (${r.employeeCode})`),
    autoFixable: false,
    description: 'These employees will be silently skipped in every payroll run. Open People → Compensation tab → Edit Salary.',
  }
}

/** Employees marked TERMINATED/RESIGNED but their User is still active. */
async function checkInactiveButLoginEnabled(): Promise<HealthCheck> {
  const rows = await prisma.employee.findMany({
    where: { status: { in: ['TERMINATED', 'RESIGNED'] }, user: { isActive: true } },
    select: { fullName: true, employeeCode: true, user: { select: { id: true } } },
    take: 100,
  })
  return {
    id: 'inactive_login_enabled',
    label: 'Inactive employees still able to log in',
    severity: rows.length > 0 ? 'warn' : 'info',
    found: rows.length,
    sample: rows.slice(0, 5).map((r) => `${r.fullName} (${r.employeeCode})`),
    autoFixable: true,
    description: 'A terminated/resigned employee whose account is still active is a security drift. Auto-fix disables their login.',
  }
}

async function fixInactiveButLoginEnabled(): Promise<number> {
  const userIds = (await prisma.employee.findMany({
    where: { status: { in: ['TERMINATED', 'RESIGNED'] }, user: { isActive: true } },
    select: { user: { select: { id: true } } },
  })).map((r) => r.user?.id).filter(Boolean) as string[]
  if (userIds.length === 0) return 0
  const r = await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { isActive: false } })
  return r.count
}

/** Probation records whose endDate has passed but outcome is still null. */
async function checkProbationOverdue(): Promise<HealthCheck> {
  const rows = await prisma.probationRecord.findMany({
    where: { outcome: null, endDate: { lt: new Date() } },
    include: { employee: { select: { fullName: true, employeeCode: true } } },
    take: 100,
  })
  return {
    id: 'probation_overdue',
    label: 'Probation past end date with no decision',
    severity: rows.length > 0 ? 'warn' : 'info',
    found: rows.length,
    sample: rows.slice(0, 5).map((r) => `${r.employee.fullName} (${r.employee.employeeCode})`),
    autoFixable: false,
    description: 'These employees are technically in limbo. HR should confirm / extend / terminate via the Onboarding → Probation Tracker.',
  }
}

/** Candidates without a match score (drift from a JD edit). */
async function checkCandidatesUnscored(): Promise<HealthCheck> {
  const found = await prisma.candidate.count({ where: { matchScore: null } })
  return {
    id: 'candidates_unscored',
    label: 'Candidates without a match score',
    severity: found > 0 ? 'warn' : 'info',
    found,
    autoFixable: true,
    description: 'Auto-fix re-runs the scoring engine on these candidates using the current JD.',
  }
}

async function fixCandidatesUnscored(): Promise<number> {
  const { scoreCandidate } = await import('./candidate-scoring')
  const cands = await prisma.candidate.findMany({
    where: { matchScore: null },
    include: { requisition: { select: { title: true, type: true, jdContent: true } } },
  })
  let fixed = 0
  for (const c of cands) {
    const { score, reason } = scoreCandidate(
      { experience: c.experience, currentCompany: c.currentCompany, currentRole: c.currentRole, source: c.source, notes: c.notes, cvUrl: c.cvUrl, fullName: c.fullName },
      { title: c.requisition.title, type: c.requisition.type, jdContent: c.requisition.jdContent },
    )
    await prisma.candidate.update({ where: { id: c.id }, data: { matchScore: score, scoreReason: reason } })
    fixed++
  }
  return fixed
}

/** Stale DRAFT payroll runs (>30 days old). They block the next month's run. */
async function checkStaleDrafts(): Promise<HealthCheck> {
  const cutoff = new Date(Date.now() - 30 * 86400_000)
  const rows = await prisma.payrollRun.findMany({
    where: { status: 'DRAFT', createdAt: { lt: cutoff } },
    select: { month: true, year: true, id: true },
    take: 100,
  })
  return {
    id: 'stale_drafts',
    label: 'Payroll runs in DRAFT for over 30 days',
    severity: rows.length > 0 ? 'warn' : 'info',
    found: rows.length,
    sample: rows.slice(0, 5).map((r) => `${r.month}/${r.year}`),
    autoFixable: false,
    description: 'Stale drafts usually mean a payroll was prepared but never approved. Review and either approve or delete.',
  }
}

/** Notifications older than 90 days. Clutter. */
async function checkOldNotifications(): Promise<HealthCheck> {
  const cutoff = new Date(Date.now() - 90 * 86400_000)
  const found = await prisma.notification.count({ where: { createdAt: { lt: cutoff } } })
  return {
    id: 'old_notifications',
    label: 'Notifications older than 90 days',
    severity: found > 50 ? 'info' : 'info',
    found,
    autoFixable: true,
    description: 'Auto-fix deletes notifications older than 90 days. Frees up DB and the bell panel.',
  }
}

async function fixOldNotifications(): Promise<number> {
  const cutoff = new Date(Date.now() - 90 * 86400_000)
  const r = await prisma.notification.deleteMany({ where: { createdAt: { lt: cutoff } } })
  return r.count
}

/** Leave balance drift — used count doesn't match approved-leave days. */
async function checkLeaveBalanceDrift(): Promise<HealthCheck> {
  // Cheap heuristic: compare leaveBalance.used vs sum of approved leave days
  // for the same employee, year, leaveType. Anything off by >0.5 counts.
  const year = new Date().getFullYear()
  const balances = await prisma.leaveBalance.findMany({ where: { year } })
  const approvedAgg = await prisma.leaveRequest.groupBy({
    by: ['employeeId', 'leaveType'],
    where: { status: 'APPROVED', fromDate: { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31) } },
    _sum: { days: true },
  })
  const sumMap = new Map<string, number>()
  for (const a of approvedAgg) sumMap.set(`${a.employeeId}::${a.leaveType}`, a._sum.days ?? 0)
  let drifted = 0
  const sample: string[] = []
  for (const b of balances) {
    const realUsed = sumMap.get(`${b.employeeId}::${b.leaveType}`) ?? 0
    if (Math.abs(realUsed - b.used) > 0.5) {
      drifted++
      if (sample.length < 5) sample.push(`${b.employeeId.slice(-6)} ${b.leaveType}: used=${b.used}, real=${realUsed}`)
    }
  }
  return {
    id: 'leave_balance_drift',
    label: 'Leave balances out of sync with approved leave',
    severity: drifted > 0 ? 'warn' : 'info',
    found: drifted,
    sample,
    autoFixable: true,
    description: 'Auto-fix recomputes used + remaining from approved leave requests.',
  }
}

async function fixLeaveBalanceDrift(): Promise<number> {
  const year = new Date().getFullYear()
  const balances = await prisma.leaveBalance.findMany({ where: { year } })
  const approvedAgg = await prisma.leaveRequest.groupBy({
    by: ['employeeId', 'leaveType'],
    where: { status: 'APPROVED', fromDate: { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31) } },
    _sum: { days: true },
  })
  const sumMap = new Map<string, number>()
  for (const a of approvedAgg) sumMap.set(`${a.employeeId}::${a.leaveType}`, a._sum.days ?? 0)
  let fixed = 0
  for (const b of balances) {
    const realUsed = sumMap.get(`${b.employeeId}::${b.leaveType}`) ?? 0
    if (Math.abs(realUsed - b.used) > 0.5) {
      const remaining = Math.max(0, b.allocated - realUsed - b.pending)
      await prisma.leaveBalance.update({
        where: { id: b.id },
        data: { used: realUsed, remaining },
      })
      fixed++
    }
  }
  return fixed
}

/** Onboarding checklists missing — every employee should have one. */
async function checkMissingOnboarding(): Promise<HealthCheck> {
  const rows = await prisma.employee.findMany({
    where: { onboarding: null },
    select: { fullName: true, employeeCode: true },
    take: 100,
  })
  return {
    id: 'missing_onboarding',
    label: 'Employees with no onboarding checklist',
    severity: rows.length > 0 ? 'warn' : 'info',
    found: rows.length,
    sample: rows.slice(0, 5).map((r) => `${r.fullName} (${r.employeeCode})`),
    autoFixable: true,
    description: 'Auto-fix creates an empty checklist so HR can start tracking onboarding steps.',
  }
}

/** Probation lifecycle — auto-prompt settling check-ins, generate decision packets, enact on meeting day. */
async function checkProbationLifecycle(): Promise<HealthCheck> {
  // Drift = records in ACTIVE/UNDER_REVIEW where a lifecycle stage is overdue
  // (settling check-in due, packet not generated, or enactment pending).
  const today = new Date()
  const records = await prisma.probationRecord.findMany({
    where: { status: { in: ['ACTIVE', 'UNDER_REVIEW'] } },
    include: { employee: { select: { fullName: true, employeeCode: true } } },
  })
  const drifted: { fullName: string; employeeCode: string }[] = []
  for (const r of records) {
    const elapsed = Math.floor((today.getTime() - r.startDate.getTime()) / 86_400_000)
    const remaining = Math.floor((r.endDate.getTime() - today.getTime()) / 86_400_000)
    if (elapsed >= 30 && r.durationMonths >= 2 && r.settlingCheckInAt == null && r.status === 'ACTIVE') {
      drifted.push(r.employee); continue
    }
    if (remaining <= 30 && r.packetGeneratedAt == null && r.status === 'ACTIVE') {
      drifted.push(r.employee); continue
    }
    if (r.hrDecision != null && r.outcomeEnactedAt == null && r.meetingScheduledFor && today >= r.meetingScheduledFor) {
      drifted.push(r.employee); continue
    }
  }
  return {
    id: 'probation_lifecycle',
    label: 'Probation lifecycle stages pending action',
    severity: drifted.length > 0 ? 'warn' : 'info',
    found: drifted.length,
    sample: drifted.slice(0, 5).map((e) => `${e.fullName} (${e.employeeCode})`),
    autoFixable: true,
    description: 'Auto-fix runs the probation reconciler: prompts settling check-ins, generates decision packets, and enacts outcomes on meeting day.',
  }
}

async function fixProbationLifecycle(): Promise<number> {
  const { runProbationReconciler } = await import('./probation-reconciler')
  const r = await runProbationReconciler()
  return r.settlingPrompted + r.packetsGenerated + r.overdueNotified + r.enacted
}

async function fixMissingOnboarding(): Promise<number> {
  const ids = (await prisma.employee.findMany({ where: { onboarding: null }, select: { id: true } })).map((e) => e.id)
  let fixed = 0
  for (const employeeId of ids) {
    await prisma.onboardingChecklist.create({ data: { employeeId } }).then(() => { fixed++ }).catch(() => {})
  }
  return fixed
}

// ─── Public API ──────────────────────────────────────────────────────

const CHECKS = [
  checkActiveWithoutSalary,
  checkInactiveButLoginEnabled,
  checkProbationOverdue,
  checkCandidatesUnscored,
  checkStaleDrafts,
  checkOldNotifications,
  checkLeaveBalanceDrift,
  checkMissingOnboarding,
  checkProbationLifecycle,
] as const

const FIXERS: Record<string, () => Promise<number>> = {
  inactive_login_enabled: fixInactiveButLoginEnabled,
  candidates_unscored: fixCandidatesUnscored,
  old_notifications: fixOldNotifications,
  leave_balance_drift: fixLeaveBalanceDrift,
  missing_onboarding: fixMissingOnboarding,
  probation_lifecycle: fixProbationLifecycle,
}

export async function runHealthScan(): Promise<HealthReport> {
  const checks = await Promise.all(CHECKS.map((c) => c().catch((e) => ({
    id: 'check_failed',
    label: `Check crashed: ${c.name}`,
    severity: 'crit' as const,
    found: 1,
    sample: [String(e?.message ?? e).slice(0, 200)],
    autoFixable: false,
    description: 'The check itself errored. Open the server logs for details.',
  }))))
  const totals = {
    critical: checks.filter((c) => c.severity === 'crit' && c.found > 0).length,
    warning:  checks.filter((c) => c.severity === 'warn' && c.found > 0).length,
    info:     checks.filter((c) => c.severity === 'info' && c.found > 0).length,
    healthy:  checks.filter((c) => c.found === 0).length,
  }
  return { scannedAt: new Date().toISOString(), checks, totals }
}

/** Run a single fixer by check ID. Returns the count of rows healed. */
export async function runHealer(id: string): Promise<{ fixed: number } | { error: string }> {
  const fn = FIXERS[id]
  if (!fn) return { error: `No auto-fix available for ${id}` }
  try {
    const fixed = await fn()
    return { fixed }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
