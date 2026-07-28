/**
 * Leave approver routing.
 *
 * Convertt routes ALL leave through the Co-Founder (Khawer) → HR:
 *
 *   - Regular employees     → Co-Founder → HR
 *   - Senior staff          → Co-Founder → HR
 *   - HR's own leave        → Co-Founder → another HR (HR can't self-approve)
 *   - Co-Founder's own leave→ (no stage-1) → HR  (single-stage)
 *
 * The CEO (Asghar) is NEVER a leave approver. His only approval role in
 * the system is PAYROLL (handled in src/app/api/payroll/*).
 *
 * Note: historically regular employees routed via reportingManager. Per
 * user clarification: "Asghar will only be asked for payroll approval
 * otherwise leaves are from Khawer" — Khawer is the single approver for
 * every leave in the company.
 *
 * The senior-staff predicate is still re-exported here because other
 * modules (e.g. the GET /api/leave status-label decorator) use it to
 * decide UI copy ("Awaiting Co-Founder").
 */

import { prisma } from '@/lib/prisma'

// DRY: the "senior staff" predicate is owned by senior-staff.ts and used by
// both the leave-approver and the leadership-messaging gates so they can't
// drift apart. Re-exported below.
import { isSeniorStaffRole } from '@/lib/senior-staff'
export { isSeniorStaffRole }

const COFOUNDER_DESIGNATION_RE = /co-?founder/i
const CEO_DESIGNATION_RE = /chief executive|\bceo\b/i

/** True if the designation looks like a Co-Founder title (Syed Khawer). */
export function isCoFounderDesignation(designation?: string | null): boolean {
  return !!designation && COFOUNDER_DESIGNATION_RE.test(designation)
}

/** True if the designation looks like a CEO title (Syed Asghar). */
export function isCeoDesignation(designation?: string | null): boolean {
  return !!designation && CEO_DESIGNATION_RE.test(designation)
}

type EmployeeForRouting = {
  id: string
  designation: string | null
  reportingManagerId: string | null
  user: { role: string } | null
  position: { level: string | null } | null
}

async function findEmployeeByDesignation(
  matcher: (designation: string) => boolean,
): Promise<{ id: string } | null> {
  // Prisma has no regex match across all DBs; pull all execs/managers and
  // filter in JS. The org is small (<200 people), this is cheap.
  const candidates = await prisma.employee.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, designation: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const hit = candidates.find((c) => c.designation && matcher(c.designation))
  return hit ? { id: hit.id } : null
}

/** Resolve the Co-Founder's Employee.id (first by createdAt if multiple match). */
export async function findCoFounderEmployeeId(): Promise<string | null> {
  const direct = await findEmployeeByDesignation((d) => COFOUNDER_DESIGNATION_RE.test(d))
  if (direct) return direct.id
  // Fallback — EXECUTIVE role + "founder" anywhere in designation.
  const fallback = await prisma.employee.findFirst({
    where: {
      status: 'ACTIVE',
      user: { role: 'EXECUTIVE' },
      designation: { contains: 'founder', mode: 'insensitive' },
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })
  return fallback?.id ?? null
}

/** Resolve the CEO's Employee.id. */
export async function findCeoEmployeeId(): Promise<string | null> {
  const direct = await findEmployeeByDesignation((d) => CEO_DESIGNATION_RE.test(d))
  return direct?.id ?? null
}

async function findFirstHrEmployeeId(): Promise<string | null> {
  const hr = await prisma.user.findFirst({
    where: { role: 'HR_ADMIN', employee: { isNot: null } },
    select: { employee: { select: { id: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return hr?.employee?.id ?? null
}

async function loadEmployeeForRouting(employeeId: string): Promise<EmployeeForRouting | null> {
  return prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      designation: true,
      reportingManagerId: true,
      user: { select: { role: true } },
      position: { select: { level: true } },
    },
  })
}

/**
 * Returns the Employee.id of the person who should approve stage-1 for
 * the given requester, or null if no approver can be resolved (caller
 * treats null as "single-stage HR approval" — the request is created
 * with status='PENDING_HR' so HR sees it directly).
 *
 * Rules:
 *   1. Requester IS the Co-Founder → null  (skip to HR)
 *   2. Otherwise                    → Co-Founder's employeeId
 *   3. No Co-Founder in DB          → null (HR direct)
 *
 * The CEO is NEVER returned by this function.
 */
export async function getStageOneApprover(employeeId: string): Promise<string | null> {
  const emp = await loadEmployeeForRouting(employeeId)
  if (!emp) return null

  // Rule 1 — the Co-Founder's own leaves skip stage 1.
  if (isCoFounderDesignation(emp.designation)) return null

  // Rule 2 — everyone else (regular employees, senior staff, HR, even the
  // CEO) routes through the Co-Founder.
  const cf = await findCoFounderEmployeeId()
  if (cf && cf !== emp.id) return cf

  // Rule 3 — fallback: no Co-Founder configured, single-stage HR.
  return null
}
