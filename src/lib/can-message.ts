/**
 * Eligibility predicate for the Leadership Chat module.
 *
 * Reuses the canonical senior-staff predicate from `senior-staff.ts` so
 * the chat gating and the leave-routing senior-staff gate can never drift.
 *
 *   Allowed roles      : HR_ADMIN, EXECUTIVE, MANAGER, LEAD
 *   Allowed designations: head|director|cto|coo|cfo|chief|principal|founder|co-founder
 *   Allowed position levels: HEAD, DIRECTOR, C_SUITE, LEAD, MANAGER
 *
 * Regular EMPLOYEE / FINANCE users without senior designations CANNOT
 * access the leadership chat. Server endpoints return 403 for them.
 */

import { isSeniorStaffRole } from '@/lib/senior-staff'

export function canUseLeadershipChat(
  role: string | null | undefined,
  designation?: string | null,
  positionLevel?: string | null,
): boolean {
  return isSeniorStaffRole(role, designation, positionLevel)
}

/**
 * Deterministic thread key for a pair of employees. Sorting the IDs makes
 * the key identical regardless of who sent the message, so we can list
 * the thread with a single index lookup.
 */
export function threadKeyFor(a: string, b: string): string {
  return [a, b].sort().join('|')
}
