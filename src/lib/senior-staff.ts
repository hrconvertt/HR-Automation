/**
 * Shared senior-staff predicate. Used by:
 *   - Leave routing (src/lib/leave-approver.ts → re-exports `isSeniorStaffRole`)
 *   - Leadership messaging (src/app/api/messages/*) for gating who can DM
 *
 * Definition (matches the AGENTS.md spec for the messaging module):
 *   - User.role ∈ {HR_ADMIN, MANAGER, LEAD, EXECUTIVE}
 *   - OR designation matches /\b(head|director|cto|coo|cfo|vp|chief|principal|founder|co-?founder)\b/i
 *   - OR Position.level ∈ {HEAD, DIRECTOR, C_SUITE, LEAD, MANAGER}
 *
 * Regular employees (designers, devs, interns) do NOT qualify.
 *
 * The leave-approver module re-uses `isSeniorStaffRole` from here (DRY)
 * so the two systems can never drift out of sync.
 */

import { prisma } from '@/lib/prisma'

const DESIGNATION_SENIOR_RE =
  /\b(head|director|cto|coo|cfo|vp|vice president|chief|principal|founder|co-?founder)\b/i

const SENIOR_POSITION_LEVELS = new Set(['HEAD', 'DIRECTOR', 'C_SUITE', 'LEAD', 'MANAGER'])
const SENIOR_ROLES = new Set(['HR_ADMIN', 'MANAGER', 'LEAD', 'EXECUTIVE'])

/**
 * Pure check — does this person count as senior staff?
 * Pass nulls for unknown fields; the check fails closed.
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

/**
 * DB-backed check for a specific Employee.id. Returns false if the employee
 * doesn't exist. Used by every messaging endpoint to gate access.
 */
export async function isSeniorStaffEmployee(employeeId: string): Promise<boolean> {
  if (!employeeId) return false
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      designation: true,
      user: { select: { role: true } },
      position: { select: { level: true } },
    },
  })
  if (!emp) return false
  return isSeniorStaffRole(
    emp.user?.role ?? null,
    emp.designation,
    emp.position?.level ?? null,
  )
}

/**
 * List all senior-staff Employees (active only). Used by the
 * "New Conversation" picker. Filters in JS because Prisma's regex
 * matching isn't portable across DBs.
 */
export async function listSeniorStaffEmployees(): Promise<
  Array<{
    id: string
    fullName: string
    designation: string | null
    department: string | null
    photoUrl: string | null
  }>
> {
  const rows = await prisma.employee.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      fullName: true,
      designation: true,
      photoUrl: true,
      department: { select: { name: true } },
      user: { select: { role: true } },
      position: { select: { level: true } },
    },
    orderBy: { fullName: 'asc' },
  })
  return rows
    .filter((r) =>
      isSeniorStaffRole(r.user?.role ?? null, r.designation, r.position?.level ?? null),
    )
    .map((r) => ({
      id: r.id,
      fullName: r.fullName,
      designation: r.designation,
      department: r.department?.name ?? null,
      photoUrl: r.photoUrl,
    }))
}
