/**
 * Canonical user-visible role labels.
 *
 * The DB enum values stay as-is (HR_ADMIN, EXECUTIVE, etc.) - never migrate.
 * Everything user-facing reads through here so we have one place to tweak
 * branding: "HR Admin" -> "HR", "Executive" -> "CEO / Executive", etc.
 */

export const VALID_ROLES = [
  'HR_ADMIN',
  'MANAGER',
  'LEAD',
  'EMPLOYEE',
  'EXECUTIVE',
  'FINANCE',
] as const

export type ValidRole = (typeof VALID_ROLES)[number]

export const ROLE_LABELS: Record<string, string> = {
  HR_ADMIN: 'HR',
  MANAGER: 'Manager',
  LEAD: 'Lead',
  EMPLOYEE: 'Employee',
  EXECUTIVE: 'CEO / Executive',
  FINANCE: 'Finance',
}

/** Short label variant (for tight UI spots like badges). */
export const ROLE_LABELS_SHORT: Record<string, string> = {
  HR_ADMIN: 'HR',
  MANAGER: 'Manager',
  LEAD: 'Lead',
  EMPLOYEE: 'Employee',
  EXECUTIVE: 'CEO',
  FINANCE: 'Finance',
}

export function roleLabel(role: string | null | undefined): string {
  if (!role) return ''
  return ROLE_LABELS[role] ?? role
}

export function roleLabelShort(role: string | null | undefined): string {
  if (!role) return ''
  return ROLE_LABELS_SHORT[role] ?? role
}

/** Order used in matrix columns and pickers. */
export const ROLE_ORDER: ValidRole[] = [
  'HR_ADMIN',
  'MANAGER',
  'LEAD',
  'EMPLOYEE',
  'EXECUTIVE',
  'FINANCE',
]
