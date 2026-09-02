/**
 * The places search can take you.
 *
 * Search only ever looked inside records — people, payslips, policies, leave,
 * letters. So typing "onboarding" or "probation" returned nothing, because
 * those are screens rather than rows, and the one word somebody types when
 * they want a screen is its name.
 *
 * Keywords carry the words that are not in the label: somebody looking for
 * the leave screen may well type "holiday", and nobody should have to guess
 * the menu's vocabulary.
 */

export interface NavDestination {
  label: string
  href: string
  /** Where it sits, shown under the label so two similar names are separable. */
  section: string
  keywords: string[]
  roles?: string[]
}

export const NAV_DESTINATIONS: NavDestination[] = [
  // Core
  { label: 'Dashboard', href: '/dashboard', section: 'Core', keywords: ['home', 'start'] },
  { label: 'People', href: '/dashboard/employees', section: 'Core', keywords: ['employees', 'staff', 'directory', 'team'] },
  { label: 'Time Tracking', href: '/dashboard/time', section: 'Core', keywords: ['clock', 'hours', 'timesheet', 'overtime'] },
  { label: 'Attendance', href: '/dashboard/attendance', section: 'Core', keywords: ['present', 'absent', 'grid', 'daily'] },
  { label: 'Leave', href: '/dashboard/leave', section: 'Core', keywords: ['holiday', 'time off', 'vacation', 'sick', 'wfh', 'annual'] },
  { label: 'Leave — Rejected', href: '/dashboard/leave/rejected', section: 'Leave', keywords: ['rejected', 'declined', 'cancelled'] },
  { label: 'Payroll', href: '/dashboard/payroll', section: 'Core', keywords: ['salary', 'pay', 'payslip', 'bank', 'wages'] },
  { label: 'Payroll Configuration', href: '/dashboard/payroll/configuration', section: 'Payroll', keywords: ['tax', 'eobi', 'gratuity', 'provident', 'slabs', 'settings'] },
  { label: 'Calendar', href: '/dashboard/calendar', section: 'Core', keywords: ['holidays', 'events', 'schedule'] },

  // Talent
  { label: 'Performance', href: '/dashboard/performance', section: 'Talent', keywords: ['appraisal', 'review', 'rating'] },
  { label: 'Goals', href: '/dashboard/performance?tab=goals', section: 'Performance', keywords: ['okr', 'objectives', 'targets'] },
  { label: 'Reviews', href: '/dashboard/performance?tab=reviews', section: 'Performance', keywords: ['review cycle', 'feedback'] },
  { label: 'Appraisal Forms', href: '/dashboard/performance/appraisals', section: 'Performance', keywords: ['appraisal', 'performance form', 'rating', 'assessment', 'due'] },
  { label: 'Show Cause', href: '/dashboard/performance?tab=showcause', section: 'Performance', keywords: ['notice', 'disciplinary', 'warning'] },
  { label: 'PIP', href: '/dashboard/performance?tab=pip', section: 'Performance', keywords: ['performance improvement plan', 'improvement', 'disciplinary'] },
  { label: 'Increments', href: '/dashboard/performance/increments', section: 'Performance', keywords: ['raise', 'increase', 'salary revision', 'due'], roles: ['HR_ADMIN', 'EXECUTIVE'] },
  { label: 'Daily Log', href: '/dashboard/daily-log', section: 'Performance', keywords: ['kpi', 'tasks', 'log'] },
  { label: 'Team Review', href: '/dashboard/daily-review', section: 'Performance', keywords: ['kpi', 'team daily', 'actuals'] },
  { label: 'Recognition', href: '/dashboard/culture', section: 'Performance', keywords: ['culture', 'awards', 'kudos', 'birthday', 'anniversary'] },

  { label: 'Employee Lifecycle', href: '/dashboard/lifecycle', section: 'Talent', keywords: ['joiner', 'mover', 'leaver'] },
  { label: 'Onboarding', href: '/dashboard/onboarding', section: 'Lifecycle', keywords: ['new hire', 'joining', 'induction', 'day 1', 'documents'] },
  { label: 'Probation', href: '/dashboard/probation', section: 'Lifecycle', keywords: ['confirmation', 'trial', 'review', 'permanent'] },
  { label: 'Exit & Clearance', href: '/dashboard/lifecycle/exit', section: 'Lifecycle', keywords: ['resignation', 'offboarding', 'leaving', 'clearance', 'final settlement'] },
  { label: 'Termination', href: '/dashboard/lifecycle/termination', section: 'Lifecycle', keywords: ['dismissal', 'terminate', 'notice'] },
  { label: 'Leave of Absence', href: '/dashboard/lifecycle/loa', section: 'Lifecycle', keywords: ['sabbatical', 'maternity', 'unpaid'] },

  { label: 'Recruiting', href: '/dashboard/recruiting', section: 'Talent', keywords: ['hiring', 'candidates', 'jobs', 'requisition', 'interview'] },
  { label: 'Training & Development', href: '/dashboard/learning', section: 'Talent', keywords: ['l&d', 'learning', 'courses', 'programs', 'certification'] },
  { label: 'Org Chart', href: '/dashboard/org-chart', section: 'Talent', keywords: ['hierarchy', 'reporting', 'structure'] },

  // Admin
  { label: 'Assets', href: '/dashboard/assets', section: 'Finance & Admin', keywords: ['laptop', 'equipment', 'devices', 'allocation'] },
  { label: 'Letters', href: '/dashboard/letters', section: 'Admin', keywords: ['experience letter', 'confirmation letter', 'document', 'register'] },
  { label: 'Policies', href: '/dashboard/policies', section: 'Admin', keywords: ['handbook', 'rules', 'playbook'] },
  { label: 'Settings', href: '/dashboard/settings', section: 'Admin', keywords: ['configuration', 'email templates', 'preferences'] },
]

/** Rank by how directly the query hits the label, then the keywords. */
export function searchDestinations(
  query: string, role: string, limit = 6,
): NavDestination[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const scored: { d: NavDestination; score: number }[] = []
  for (const d of NAV_DESTINATIONS) {
    if (d.roles && !d.roles.includes(role)) continue
    const label = d.label.toLowerCase()
    let score = 0
    if (label === q) score = 100
    else if (label.startsWith(q)) score = 80
    else if (label.includes(q)) score = 60
    else if (d.keywords.some((k) => k === q)) score = 50
    else if (d.keywords.some((k) => k.startsWith(q))) score = 40
    else if (d.keywords.some((k) => k.includes(q))) score = 25
    else if (d.section.toLowerCase().includes(q)) score = 15
    if (score > 0) scored.push({ d, score })
  }
  return scored
    .sort((a, b) => b.score - a.score || a.d.label.localeCompare(b.d.label))
    .slice(0, limit)
    .map((x) => x.d)
}
