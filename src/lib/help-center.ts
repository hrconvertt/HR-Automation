/**
 * Help Center vocabulary — article categories, case types, service teams and
 * statuses. Free of server imports so client components use the same words
 * the API validates against.
 *
 * Modelled on Workday's Help Center: Find Answers by category, an article
 * reader, and cases routed to a service team by what the case is about.
 */

export const ARTICLE_CATEGORIES = [
  { key: 'HUMAN_RESOURCES', label: 'Human Resources' },
  { key: 'LEAVE', label: 'Leave & Time Off' },
  { key: 'PAYROLL', label: 'Payroll' },
  { key: 'BENEFITS', label: 'Benefits' },
  { key: 'POLICIES', label: 'Policies' },
  { key: 'IT', label: 'IT & Equipment' },
  { key: 'USING_THE_APP', label: 'Using Convertt HR' },
] as const
export type ArticleCategory = (typeof ARTICLE_CATEGORIES)[number]['key']
export const ARTICLE_CATEGORY_KEYS = ARTICLE_CATEGORIES.map((c) => c.key) as readonly string[]
export function articleCategoryLabel(key: string): string {
  return ARTICLE_CATEGORIES.find((c) => c.key === key)?.label ?? key
}

export const SERVICE_TEAMS = [
  { key: 'HR', label: 'Human Resources' },
  { key: 'PAYROLL', label: 'Payroll' },
  { key: 'FINANCE', label: 'Finance' },
  { key: 'IT', label: 'IT' },
  { key: 'HR_CONFIDENTIAL', label: 'HR Confidential' },
] as const
export function serviceTeamLabel(key: string | null | undefined): string {
  return SERVICE_TEAMS.find((t) => t.key === key)?.label ?? 'Human Resources'
}

/**
 * What a case can be about. The type decides the service team that works it
 * and the article category its suggested resources come from.
 */
export const CASE_TYPES = [
  { value: 'LEAVE', label: 'Leave & time off', team: 'HR', category: 'LEAVE' },
  { value: 'ATTENDANCE', label: 'Attendance & time tracking', team: 'HR', category: 'HUMAN_RESOURCES' },
  { value: 'PAYROLL', label: 'Pay & payslips', team: 'PAYROLL', category: 'PAYROLL' },
  { value: 'BENEFITS', label: 'Benefits & allowances', team: 'PAYROLL', category: 'BENEFITS' },
  { value: 'DOCUMENTS', label: 'Letters & documents', team: 'HR', category: 'HUMAN_RESOURCES' },
  { value: 'POLICY', label: 'A question about a policy', team: 'HR', category: 'POLICIES' },
  { value: 'EXPENSES', label: 'Expenses & reimbursements', team: 'FINANCE', category: 'PAYROLL' },
  { value: 'IT', label: 'IT, laptop & system access', team: 'IT', category: 'IT' },
  { value: 'CONFIDENTIAL', label: 'A confidential concern', team: 'HR_CONFIDENTIAL', category: 'POLICIES' },
  { value: 'GENERAL', label: 'Something else', team: 'HR', category: 'HUMAN_RESOURCES' },
] as const
export const CASE_TYPE_VALUES = CASE_TYPES.map((t) => t.value) as readonly string[]
export function caseTypeOf(value: string) {
  const hit = CASE_TYPES.find((t) => t.value === value)
  if (hit) return hit
  // Tickets raised before cases had types: OTHER, and the old free categories.
  return { value, label: value === 'OTHER' ? 'Something else' : value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' '), team: 'HR', category: 'HUMAN_RESOURCES' }
}

export const CASE_STATUSES = [
  { value: 'OPEN', label: 'New' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'ON_HOLD', label: 'On hold' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
] as const
export const CASE_STATUS_VALUES = CASE_STATUSES.map((s) => s.value) as readonly string[]
export const OPEN_CASE_STATUSES = ['OPEN', 'IN_PROGRESS', 'ON_HOLD']
export function caseStatusLabel(v: string): string {
  return CASE_STATUSES.find((s) => s.value === v)?.label ?? v
}

export const CASE_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const

export function caseLabel(caseNumber: number | null | undefined, id: string): string {
  return caseNumber ? `CASE${String(caseNumber).padStart(6, '0')}` : `CASE-${id.slice(-6).toUpperCase()}`
}

export const CASE_TITLE_MAX = 150
export const ATTACHMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024

export const FEEDBACK_REFS = ['ARTICLE', 'POLICY', 'GUIDE'] as const
export type FeedbackRef = (typeof FEEDBACK_REFS)[number]

export const ARTICLE_STATUSES = ['DRAFT', 'PUBLISHED'] as const
export const ARTICLE_AUDIENCE_ROLES = ['EMPLOYEE', 'MANAGER', 'EXECUTIVE', 'HR_ADMIN'] as const
