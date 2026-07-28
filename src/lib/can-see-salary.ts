/**
 * Salary visibility — single source of truth.
 *
 * Rule (user's explicit words, repeated multiple times):
 *   "salary amount should be visible to only hr and the individual employees
 *    not the managers"
 *   "salaries of all employee should only be visible to HR and executive
 *    irrespective of that every individual employee will see his respective
 *    salary"
 *
 * Allowed roles:
 *   - HR_ADMIN              — sees all
 *   - EXECUTIVE  (CEO etc.) — sees all
 *   - FINANCE               — sees all (payroll work requires it)
 *   - the salary owner      — sees own
 *
 * Explicitly denied:
 *   - MANAGER  — never sees direct reports' salaries
 *   - LEAD     — never sees team's salaries
 *   - any other EMPLOYEE viewing another EMPLOYEE
 *
 * Use this helper EVERYWHERE that touches compensation. Do not inline
 * role checks — that's how leaks happen.
 */

export type Role =
  | 'HR_ADMIN'
  | 'EXECUTIVE'
  | 'FINANCE'
  | 'MANAGER'
  | 'LEAD'
  | 'EMPLOYEE'
  | string

interface Args {
  viewerRole: Role
  viewerEmployeeId: string | null
  targetEmployeeId: string
}

export function canSeeSalary({
  viewerRole,
  viewerEmployeeId,
  targetEmployeeId,
}: Args): boolean {
  if (
    viewerRole === 'HR_ADMIN' ||
    viewerRole === 'EXECUTIVE' ||
    viewerRole === 'FINANCE'
  ) {
    return true
  }
  if (viewerEmployeeId && viewerEmployeeId === targetEmployeeId) {
    return true
  }
  return false
}

/**
 * Coarser variant — can this viewer see salary in aggregate (e.g. payroll
 * pages, comp dashboards, exports). Owner-only access doesn't apply here
 * because there is no single target.
 */
export function canSeeAggregateSalary(viewerRole: Role): boolean {
  return (
    viewerRole === 'HR_ADMIN' ||
    viewerRole === 'EXECUTIVE' ||
    viewerRole === 'FINANCE'
  )
}
