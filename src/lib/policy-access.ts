/**
 * Shared access logic for the Policies module.
 *
 * Audience rules (`PolicyDocument.audience`):
 *   - ALL       → every employee
 *   - MANAGERS  → users whose role is MANAGER (or who manage at least one report)
 *   - HR_ONLY   → users whose role is HR_ADMIN
 *
 * Visibility:
 *   - HR_ADMIN          → can see any policy at any status (DRAFT / PUBLISHED / ARCHIVED)
 *   - Everyone else     → only PUBLISHED policies whose audience includes them
 */

type Policy = {
  status: string
  audience: string
}

export function canSeePolicy(
  policy: Policy,
  role: string,
): boolean {
  if (role === 'HR_ADMIN') return true
  if (policy.status !== 'PUBLISHED') return false
  if (policy.audience === 'ALL') return true
  if (policy.audience === 'MANAGERS' && role === 'MANAGER') return true
  if (policy.audience === 'HR_ONLY' && role === 'HR_ADMIN') return true
  return false
}

/** Can this user acknowledge this policy? Stricter than canSee — must be in audience and policy must be PUBLISHED. */
export function canAcknowledgePolicy(
  policy: Policy,
  role: string,
): boolean {
  if (policy.status !== 'PUBLISHED') return false
  if (policy.audience === 'ALL') return true
  if (policy.audience === 'MANAGERS' && role === 'MANAGER') return true
  if (policy.audience === 'HR_ONLY' && role === 'HR_ADMIN') return true
  return false
}

/**
 * Resolve a policy audience string to the list of ACTIVE employee IDs that
 * should be enrolled (i.e., get a PENDING acknowledgement row).
 *
 *   ALL      → every active employee
 *   MANAGERS → employees whose linked user has role=MANAGER, OR who have ≥1
 *              direct report (covers managers without a User record too)
 *   HR_ONLY  → employees whose linked user has role=HR_ADMIN
 *
 * This must stay aligned with `canSeePolicy` so visibility and enrolment agree.
 */
import type { PrismaClient } from '@prisma/client'
export async function resolveAudienceEmployeeIds(
  prisma: PrismaClient,
  audience: string,
): Promise<string[]> {
  if (audience === 'ALL') {
    const all = await prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    })
    return all.map((e) => e.id)
  }
  if (audience === 'MANAGERS') {
    // Union of: (a) employees with user.role=MANAGER, (b) anyone listed as a reportingManager
    const [byRole, byReports] = await Promise.all([
      prisma.employee.findMany({
        where: { status: 'ACTIVE', user: { role: 'MANAGER' } },
        select: { id: true },
      }),
      prisma.employee.findMany({
        where: { status: 'ACTIVE', directReports: { some: {} } },
        select: { id: true },
      }),
    ])
    return Array.from(new Set([...byRole.map((e) => e.id), ...byReports.map((e) => e.id)]))
  }
  if (audience === 'HR_ONLY') {
    const hr = await prisma.employee.findMany({
      where: { status: 'ACTIVE', user: { role: 'HR_ADMIN' } },
      select: { id: true },
    })
    return hr.map((e) => e.id)
  }
  return []
}
