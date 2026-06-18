/**
 * Leave approver routing.
 *
 * Convertt has two tiers of leave routing:
 *
 *   - Regular employees                          → reportingManager → HR
 *   - Senior staff (Manager / Lead / Head /      → Co-Founder       → HR
 *     Director / CTO / COO / C-suite)
 *
 * Plus a few special cases:
 *   - The Co-Founder's own leave                 → CEO (fallback HR)
 *   - The CEO's own leave                        → Co-Founder (fallback HR)
 *   - HR's own leave                             → Co-Founder
 *
 * Detection of "senior staff" is intentionally permissive — role +
 * designation keywords + Position.level — because real-world titles drift
 * faster than the role enum.
 */

import { prisma } from '@/lib/prisma'

const DESIGNATION_SENIOR_RE = /\b(head|director|cto|coo|cfo|vp|vice president|chief|principal)\b/i
const COFOUNDER_DESIGNATION_RE = /co-?founder/i
const CEO_DESIGNATION_RE = /chief executive|\bceo\b/i
const SENIOR_POSITION_LEVELS = new Set(['HEAD', 'DIRECTOR', 'C_SUITE', 'LEAD', 'MANAGER'])
const SENIOR_ROLES = new Set(['MANAGER', 'LEAD', 'EXECUTIVE'])

/**
 * Pure check — does this person count as "senior staff" for routing?
 * Used both by the submit endpoint and the UI badge.
 */
export function isSeniorStaffRole(
  role: string | null | undefined,
  designation?: string | null,
  positionLevel?: string | null,
): boolean {
  if (role && SENIOR_ROLES.has(role)) return true
  if (designation && DESIGNATION_SENIOR_RE.test(designation)) return true
  if (positionLevel && SENIOR_POSITION_LEVELS.has(positionLevel)) return true
  return false
}

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
 * should treat as HR-only single-stage).
 *
 * See module docstring for the routing rules.
 */
export async function getStageOneApprover(employeeId: string): Promise<string | null> {
  const emp = await loadEmployeeForRouting(employeeId)
  if (!emp) return null

  const designation = emp.designation
  const role = emp.user?.role ?? null
  const level = emp.position?.level ?? null

  // ── Special cases first ─────────────────────────────────────────────
  if (isCoFounderDesignation(designation)) {
    // Co-Founder's own leave → CEO (or HR)
    const ceo = await findCeoEmployeeId()
    if (ceo && ceo !== emp.id) return ceo
    return findFirstHrEmployeeId()
  }
  if (isCeoDesignation(designation)) {
    // CEO's own leave → Co-Founder (or HR)
    const cf = await findCoFounderEmployeeId()
    if (cf && cf !== emp.id) return cf
    return findFirstHrEmployeeId()
  }
  if (role === 'HR_ADMIN') {
    // HR's own leave → Co-Founder (or null = HR-only, but then they'd be
    // approving themselves — fall back to CEO)
    const cf = await findCoFounderEmployeeId()
    if (cf && cf !== emp.id) return cf
    const ceo = await findCeoEmployeeId()
    if (ceo && ceo !== emp.id) return ceo
    return null
  }

  // ── Senior staff → Co-Founder ───────────────────────────────────────
  if (isSeniorStaffRole(role, designation, level)) {
    const cf = await findCoFounderEmployeeId()
    if (cf && cf !== emp.id) return cf
    // Fallback — no Co-Founder configured, use reportingManager.
    return emp.reportingManagerId ?? null
  }

  // ── Regular employees → reportingManager ────────────────────────────
  return emp.reportingManagerId ?? null
}
