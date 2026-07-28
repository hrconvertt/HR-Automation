/**
 * Banking visibility — single source of truth.
 *
 * Mirrors the canSeeSalary helper for IBAN, bank account #, and account
 * title. Banking info is more sensitive than display-only personal info
 * and must NOT leak to Managers, Leads, Executives, or peer Employees.
 *
 * Allowed:
 *   - HR_ADMIN     — sees all
 *   - FINANCE      — sees all (needs it for IBFT / payroll disbursement)
 *   - the account owner — sees own
 *
 * Explicitly denied:
 *   - MANAGER, LEAD, EXECUTIVE, other EMPLOYEE
 *
 * Why deny EXECUTIVE here (unlike salary)?
 *   Banking is a transactional credential — only the people who actually
 *   move money need it. The CEO doesn't approve IBANs.
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

export function canSeeBanking({
  viewerRole,
  viewerEmployeeId,
  targetEmployeeId,
}: Args): boolean {
  if (viewerRole === 'HR_ADMIN' || viewerRole === 'FINANCE') return true
  if (viewerEmployeeId && viewerEmployeeId === targetEmployeeId) return true
  return false
}
