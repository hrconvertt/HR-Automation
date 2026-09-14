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
  { label: 'Half Days', href: '/dashboard/leave/half-day', section: 'Leave', keywords: ['half day', 'halfday', 'part day', 'morning off', 'afternoon off', '0.5'] },
  { label: 'Leave — Rejected', href: '/dashboard/leave/rejected', section: 'Leave', keywords: ['rejected', 'declined', 'cancelled'] },
  { label: 'Payroll', href: '/dashboard/payroll', section: 'Core', keywords: ['salary', 'pay', 'payslip', 'bank', 'wages'] },
  { label: 'Payroll Configuration', href: '/dashboard/payroll/configuration', section: 'Payroll', keywords: ['tax', 'eobi', 'gratuity', 'provident', 'slabs', 'settings'] },
  { label: 'Calendar', href: '/dashboard/calendar', section: 'Core', keywords: ['holidays', 'events', 'schedule'] },

  // Talent
  { label: 'Performance', href: '/dashboard/performance', section: 'Talent', keywords: ['appraisal', 'review', 'rating'] },
  { label: 'Goals', href: '/dashboard/performance?tab=goals', section: 'Performance', keywords: ['okr', 'objectives', 'targets'] },
  { label: 'Reviews', href: '/dashboard/performance?tab=reviews', section: 'Performance', keywords: ['review cycle', 'feedback'] },
  // Roles below mirror each page's own gate, so search never offers a screen
  // that sends the person straight back out or says "Access denied".
  { label: 'Appraisal Forms', href: '/dashboard/performance/appraisals', section: 'Performance', keywords: ['appraisal', 'performance form', 'rating', 'assessment', 'due'], roles: ['HR_ADMIN', 'MANAGER', 'EXECUTIVE'] },
  { label: 'Show Cause', href: '/dashboard/performance?tab=showcause', section: 'Performance', keywords: ['notice', 'disciplinary', 'warning'], roles: ['HR_ADMIN', 'MANAGER', 'EMPLOYEE'] },
  { label: 'PIP', href: '/dashboard/performance?tab=pip', section: 'Performance', keywords: ['performance improvement plan', 'improvement', 'disciplinary'], roles: ['HR_ADMIN', 'MANAGER', 'EMPLOYEE'] },
  { label: 'Increments', href: '/dashboard/performance/increments', section: 'Performance', keywords: ['raise', 'increase', 'salary revision', 'due'], roles: ['HR_ADMIN', 'EXECUTIVE'] },
  { label: 'Daily Log', href: '/dashboard/daily-log', section: 'Performance', keywords: ['kpi', 'tasks', 'log'] },
  { label: 'Team Review', href: '/dashboard/daily-review', section: 'Performance', keywords: ['kpi', 'team daily', 'actuals'], roles: ['HR_ADMIN', 'MANAGER', 'LEAD', 'EXECUTIVE'] },
  { label: 'Recognition', href: '/dashboard/culture/recognition', section: 'People & Culture', keywords: ['culture', 'awards', 'kudos', 'birthday', 'anniversary'] },
  { label: 'Pulse', href: '/dashboard/culture/pulse', section: 'People & Culture', keywords: ['engagement', 'survey', 'enps', 'how people feel', 'morale'] },
  { label: 'Talent Review', href: '/dashboard/performance/talent', section: 'Performance', keywords: ['nine box', '9-box', 'potential', 'succession', 'flight risk'], roles: ['HR_ADMIN', 'EXECUTIVE'] },
  { label: 'Skills', href: '/dashboard/people/skills', section: 'Training & Development', keywords: ['who can cover', 'capability', 'expertise', 'cover'] },
  { label: 'My Journeys', href: '/dashboard/my-journeys', section: 'Career Hub', keywords: ['journey', 'onboarding steps', 'first week', 'new manager', 'steps', 'guided'] },
  { label: 'Journeys Studio', href: '/dashboard/journeys/studio', section: 'Employee Lifecycle', keywords: ['build journey', 'transition to management', 'distribute', 'journey metrics'], roles: ['HR_ADMIN'] },
  { label: 'Help Center', href: '/dashboard/help', section: 'Help', keywords: ['help', 'faq', 'answers', 'question', 'how do i', 'support'] },
  { label: 'Create Case', href: '/dashboard/help/cases/new', section: 'Help', keywords: ['case', 'ticket', 'help desk', 'raise', 'complaint', 'concern', 'issue'] },
  { label: 'My Cases', href: '/dashboard/help/cases', section: 'Help', keywords: ['cases', 'tickets', 'help desk'] },
  { label: 'Case Management', href: '/dashboard/help/case-management', section: 'Help', keywords: ['help dashboard', 'open cases', 'service team'], roles: ['HR_ADMIN', 'EXECUTIVE'] },
  { label: 'Career Hub', href: '/dashboard/career', section: 'Career Hub', keywords: ['career', 'grow', 'mentor', 'suggestions', 'next role', 'skill interests'] },
  { label: 'Career Path Builder', href: '/dashboard/career/path', section: 'Career Hub', keywords: ['career path', 'next move', 'promotion path', 'plan'] },
  { label: 'Flex Teams', href: '/dashboard/career/flex-teams', section: 'Career Hub', keywords: ['flex team', 'project', 'gig', 'stretch'] },
  { label: 'Navigate Succession Plans', href: '/dashboard/performance/succession/navigate', section: 'Performance', keywords: ['successor chart', 'succession org chart'], roles: ['HR_ADMIN', 'EXECUTIVE'] },
  { label: 'Team Insights', href: '/dashboard/team-insights', section: 'Performance', keywords: ['manager hub', 'check-in', 'one to one', '1:1', 'mentor', 'development plan', 'career'], roles: ['HR_ADMIN', 'MANAGER', 'EXECUTIVE'] },
  { label: 'Succession Planning', href: '/dashboard/performance/succession', section: 'Performance', keywords: ['successor', 'nine box', '9-box', 'bench', 'cover a role', 'flight risk'], roles: ['HR_ADMIN', 'EXECUTIVE'] },
  { label: 'Skills Dashboard', href: '/dashboard/performance/skills', section: 'Performance', keywords: ['skill gaps', 'adoption', 'mentoring', 'engagement'], roles: ['HR_ADMIN', 'EXECUTIVE'] },

  { label: 'Employee Lifecycle', href: '/dashboard/lifecycle', section: 'Talent', keywords: ['joiner', 'mover', 'leaver'], roles: ['HR_ADMIN', 'EXECUTIVE'] },
  { label: 'Onboarding', href: '/dashboard/onboarding', section: 'Lifecycle', keywords: ['new hire', 'joining', 'induction', 'day 1', 'documents'], roles: ['HR_ADMIN', 'EXECUTIVE'] },
  { label: 'Probation', href: '/dashboard/probation', section: 'Lifecycle', keywords: ['confirmation', 'trial', 'review', 'permanent'], roles: ['HR_ADMIN', 'MANAGER', 'EXECUTIVE'] },
  { label: 'Exit & Clearance', href: '/dashboard/lifecycle/exit', section: 'Lifecycle', keywords: ['resignation', 'offboarding', 'leaving', 'clearance', 'final settlement'], roles: ['HR_ADMIN', 'EXECUTIVE'] },
  { label: 'Termination', href: '/dashboard/lifecycle/termination', section: 'Lifecycle', keywords: ['dismissal', 'terminate', 'notice'], roles: ['HR_ADMIN', 'EXECUTIVE'] },
  { label: 'Leave of Absence', href: '/dashboard/lifecycle/loa', section: 'Lifecycle', keywords: ['sabbatical', 'maternity', 'unpaid'], roles: ['HR_ADMIN'] },

  { label: 'Recruiting', href: '/dashboard/recruiting', section: 'Talent', keywords: ['hiring', 'candidates', 'jobs', 'requisition', 'interview'], roles: ['HR_ADMIN', 'MANAGER', 'EXECUTIVE'] },
  { label: 'Training & Development', href: '/dashboard/learning', section: 'Talent', keywords: ['l&d', 'learning', 'courses', 'programs', 'certification'] },
  { label: 'Org Chart', href: '/dashboard/org-chart', section: 'Talent', keywords: ['hierarchy', 'reporting', 'structure'] },

  // Admin
  // Assets is hidden from the menu for now, so search does not offer it either.
  { label: 'Letters', href: '/dashboard/letters', section: 'Admin', keywords: ['experience letter', 'confirmation letter', 'document', 'register'] },
  { label: 'Policies', href: '/dashboard/policies', section: 'Admin', keywords: ['handbook', 'rules', 'playbook'] },
  { label: 'Settings', href: '/dashboard/settings', section: 'Admin', keywords: ['configuration', 'email templates', 'preferences'] },
  { label: 'Interim Rules', href: '/dashboard/settings/interim-rules', section: 'Settings', keywords: ['hr only', 'temporary', 'shortcuts', 'switch off', 'when employees join'], roles: ['HR_ADMIN', 'EXECUTIVE'] },
  { label: 'Audit Trail', href: '/dashboard/settings/audit', section: 'Settings', keywords: ['who changed', 'history', 'log', 'trail', 'changed the salary', 'evidence', 'when was it changed'], roles: ['HR_ADMIN', 'EXECUTIVE'] },
]

/**
 * The things search can start.
 *
 * Workday's search answers "create" with tasks — Create Audit Log, Create
 * Calculated Field — not only with the screens those tasks live on. Somebody
 * who types a verb wants to do something, and "Leave" is one step further from
 * "Request Leave" than it needs to be.
 *
 * Each label is the button's own wording, so the task and the dialog it opens
 * read the same; `section` names the screen the button is on. There is no
 * route that opens a dialog by itself, so a task takes you to that screen and
 * the button is the first thing on it. Roles mirror who sees the button.
 */
export const NAV_TASKS: NavDestination[] = [
  // Everyone
  { label: 'Request Leave', href: '/dashboard/leave/me', section: 'Leave › My Leave', keywords: ['apply', 'apply for leave', 'time off', 'holiday', 'sick', 'annual', 'create leave request'] },
  { label: 'Request a Letter', href: '/dashboard/letters', section: 'Letters', keywords: ['experience letter', 'salary certificate', 'noc', 'visa', 'create letter request', 'apply'] },
  { label: 'Give Kudos', href: '/dashboard/culture/recognition', section: 'People & Culture › Recognition', keywords: ['recognise', 'recognize', 'appreciate', 'thank', 'create kudos'] },
  { label: 'Add New Goal', href: '/dashboard/performance?tab=goals', section: 'Performance › Goals', keywords: ['create goal', 'okr', 'objective', 'target', 'new'] },
  { label: 'Change My Schedule Preferences', href: '/dashboard/time/schedule', section: 'Time Tracking › My Schedule', keywords: ['shift', 'hours', 'edit', 'update'] },

  // People managers
  { label: 'Request to Hire', href: '/dashboard/recruiting', section: 'Recruiting', keywords: ['create requisition', 'new role', 'headcount', 'hire', 'new'], roles: ['MANAGER'] },
  { label: 'Add Candidate', href: '/dashboard/recruiting?tab=pipeline', section: 'Recruiting › Pipeline', keywords: ['create candidate', 'applicant', 'resume', 'cv', 'new'], roles: ['HR_ADMIN', 'MANAGER'] },
  { label: 'Assign Task', href: '/dashboard/tasks', section: 'My Tasks › Team Tasks', keywords: ['create task', 'to do', 'delegate', 'new'], roles: ['HR_ADMIN', 'MANAGER'] },
  { label: 'Schedule a Check-in', href: '/dashboard/team-insights', section: 'Team Insights', keywords: ['one to one', '1:1', 'meeting', 'create check-in', 'new'], roles: ['HR_ADMIN', 'MANAGER'] },
  { label: 'Create Performance Improvement Plan', href: '/dashboard/performance?tab=pip', section: 'Performance › PIP', keywords: ['pip', 'improvement', 'new'], roles: ['HR_ADMIN', 'MANAGER'] },
  { label: 'Flag a Show Cause Concern', href: '/dashboard/performance?tab=showcause', section: 'Performance › Show Cause', keywords: ['create show cause', 'notice', 'disciplinary', 'warning', 'new'], roles: ['HR_ADMIN', 'MANAGER'] },

  // HR
  { label: 'Add New Employee', href: '/dashboard/employees', section: 'People', keywords: ['create employee', 'hire', 'new hire', 'joiner', 'onboard', 'new'], roles: ['HR_ADMIN'] },
  { label: 'New Requisition', href: '/dashboard/recruiting?tab=requisitions', section: 'Recruiting › Requisitions', keywords: ['create requisition', 'job opening', 'vacancy', 'role'], roles: ['HR_ADMIN'] },
  { label: 'New Job Description', href: '/dashboard/recruiting/new-jd', section: 'Recruiting', keywords: ['create jd', 'jd', 'job description', 'write'], roles: ['HR_ADMIN'] },
  { label: 'Open New Review Cycle', href: '/dashboard/performance?tab=reviews', section: 'Performance › Reviews', keywords: ['create review cycle', 'appraisal', 'start review', 'new'], roles: ['HR_ADMIN'] },
  { label: 'New Job Change', href: '/dashboard/lifecycle/job-changes', section: 'Employee Lifecycle › Job Changes', keywords: ['create job change', 'promotion', 'transfer', 'designation change'], roles: ['HR_ADMIN'] },
  { label: 'Start Leave of Absence', href: '/dashboard/lifecycle/loa', section: 'Employee Lifecycle › Leave of Absence', keywords: ['create loa', 'loa', 'sabbatical', 'maternity', 'unpaid', 'new'], roles: ['HR_ADMIN'] },
  { label: 'Verify an Employer', href: '/dashboard/lifecycle/verification', section: 'Employee Lifecycle › Background Verification', keywords: ['create verification', 'background check', 'reference', 'new'], roles: ['HR_ADMIN'] },
  { label: 'Run Payroll', href: '/dashboard/payroll', section: 'Payroll › Payroll Run', keywords: ['create payroll', 'generate payslips', 'salary', 'pay run'], roles: ['HR_ADMIN'] },
  { label: 'New Advance', href: '/dashboard/payroll/advances', section: 'Payroll › Loans & Advances', keywords: ['create advance', 'loan', 'salary advance'], roles: ['HR_ADMIN'] },
  { label: 'New Policy', href: '/dashboard/policies', section: 'Policies', keywords: ['create policy', 'handbook', 'rule'], roles: ['HR_ADMIN'] },
  { label: 'New Program', href: '/dashboard/learning?tab=programs', section: 'Training & Development › Programs', keywords: ['create program', 'course', 'training', 'learning'], roles: ['HR_ADMIN'] },
  { label: 'Add Company Event', href: '/dashboard/culture/events', section: 'People & Culture › Events', keywords: ['create event', 'celebration', 'party', 'new'], roles: ['HR_ADMIN'] },
  { label: 'Add Department', href: '/dashboard/settings/departments', section: 'Settings › Departments', keywords: ['create department', 'organization', 'org', 'team', 'new'], roles: ['HR_ADMIN'] },
  { label: 'Add Holiday', href: '/dashboard/settings/holidays', section: 'Settings › Holidays & WFH', keywords: ['create holiday', 'public holiday', 'gazetted', 'new'], roles: ['HR_ADMIN'] },
]

/** Rank by how directly the query hits the label, then the keywords. */
function rank(
  list: NavDestination[], query: string, role: string, limit: number,
): NavDestination[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const scored: { d: NavDestination; score: number }[] = []
  for (const d of list) {
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

export function searchDestinations(query: string, role: string, limit = 6): NavDestination[] {
  return rank(NAV_DESTINATIONS, query, role, limit)
}

/**
 * No short cap: "create" should list every task you can start, the way
 * Workday's does, and the panel scrolls. A bare "create" keyword on a few
 * tasks used to outrank every "create …" one and push HR's own off the list.
 */
export function searchTasks(query: string, role: string, limit = 30): NavDestination[] {
  return rank(NAV_TASKS, query, role, limit)
}
