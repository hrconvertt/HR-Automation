/**
 * Convertt task templates for employee Journeys — onboarding & offboarding.
 *
 * - ONBOARDING runs from offer-accept (Pre-Day-1) through to probation confirmation
 * - OFFBOARDING runs from notice given through to last day + post-departure cleanup
 *
 * Each task carries:
 *   - category    (grouping in the UI)
 *   - phase       (timeline bucket)
 *   - role        (default responsible role)
 *   - dueDays     (offset from journey anchor — negative = before)
 *   - blocking    (must complete before phase advances)
 *   - templateUrl (downloadable doc template — served from /public/templates)
 *   - requiresUpload (this task expects a signed/filled doc back from the actor)
 *   - applyToTypes (employment-type filter — task only applied when employee.employeeType matches)
 */

export type TaskRole = 'HR_ADMIN' | 'MANAGER' | 'IT' | 'FINANCE' | 'EMPLOYEE' | 'BUDDY'

export type TaskTemplate = {
  title: string
  description?: string
  category: string
  phase: string
  role: TaskRole
  dueDays: number
  blocking?: boolean
  templateUrl?: string
  generateType?: string   // doc-generator type (overrides templateUrl with auto-fill)
  requiresUpload?: boolean
  applyToTypes?: string[]   // e.g. ['PERMANENT','PROBATION'] — if absent applies to all
  applyToReasons?: string[] // e.g. ['TERMINATION_PERFORMANCE'] — offboarding-only
}

// ─── ONBOARDING (anchored to joiningDate) ────────────────────────────────────

export const ONBOARDING_TEMPLATE: TaskTemplate[] = [
  // ─── Pre-Day-1 ───────────────────────────────────────────────────
  { title: 'Send welcome email & joining details',
    description: 'Confirm joining date, office address (Mega Tower, Gulberg), dress code, what to bring.',
    category: 'INTRO', phase: 'PRE_DAY1', role: 'HR_ADMIN', dueDays: -7, blocking: true },

  { title: 'Issue Offer Letter',
    description: 'Auto-generated from employee data: designation, salary breakdown, joining date.',
    category: 'PAPERWORK', phase: 'PRE_DAY1', role: 'HR_ADMIN', dueDays: -7, blocking: true,
    generateType: 'offer_letter' },

  // Two variants of the Employment Agreement — only the matching one will be
  // added for the joining employee (filtered by employeeType at journey creation).
  { title: 'Sign Employment Agreement (Permanent / Probation)',
    description: 'Auto-generated agreement with employee name, CNIC, role, full salary breakdown.',
    category: 'LEGAL', phase: 'PRE_DAY1', role: 'EMPLOYEE', dueDays: -3, blocking: true,
    generateType: 'employment_agreement',
    applyToTypes: ['PERMANENT', 'PROBATION'] },

  { title: 'Sign Employment Agreement (Training / Internship)',
    description: 'Auto-generated Training & Internship variant with stipend and term.',
    category: 'LEGAL', phase: 'PRE_DAY1', role: 'EMPLOYEE', dueDays: -3, blocking: true,
    generateType: 'employment_agreement_intern',
    applyToTypes: ['INTERNSHIP', 'TRAINING'] },

  { title: 'Sign NDA Agreement',
    description: 'Auto-generated NDA personalised with employee name and CNIC.',
    category: 'LEGAL', phase: 'PRE_DAY1', role: 'EMPLOYEE', dueDays: -3, blocking: true,
    generateType: 'nda' },

  { title: 'Submit CNIC photocopy',
    description: 'One photocopy of your CNIC (both sides).',
    category: 'PAPERWORK', phase: 'PRE_DAY1', role: 'EMPLOYEE', dueDays: -2, blocking: true,
    requiresUpload: true },

  { title: 'Submit passport-sized photograph',
    description: 'One passport-sized photo for ID card + HRIS profile.',
    category: 'PAPERWORK', phase: 'PRE_DAY1', role: 'EMPLOYEE', dueDays: -2,
    requiresUpload: true },

  { title: 'Submit Education Certificate',
    description: 'One photocopy of your latest educational degree (or official transcript if currently studying).',
    category: 'PAPERWORK', phase: 'PRE_DAY1', role: 'EMPLOYEE', dueDays: -2,
    requiresUpload: true },

  { title: 'Submit Experience Letter (previous employer)',
    description: 'Employment experience letter from your previous employer. Skip if this is your first job.',
    category: 'PAPERWORK', phase: 'PRE_DAY1', role: 'EMPLOYEE', dueDays: -2,
    requiresUpload: true,
    applyToTypes: ['PERMANENT', 'PROBATION'] },

  { title: 'Provide bank account details',
    description: 'IBAN + bank name + branch for salary disbursement.',
    category: 'PAPERWORK', phase: 'PRE_DAY1', role: 'EMPLOYEE', dueDays: -2, blocking: true },

  { title: 'Provision IT accounts (Email, Slack, project tools)',
    description: 'Set up @convertt.co email + Slack + role-specific tools — all access ready before Day 1.',
    category: 'SYSTEM_ACCESS', phase: 'PRE_DAY1', role: 'IT', dueDays: -1, blocking: true },

  { title: 'Prepare laptop & accessories',
    description: 'Coordinate with IT — device ready on desk Day 1.',
    category: 'EQUIPMENT', phase: 'PRE_DAY1', role: 'IT', dueDays: -3 },

  // ─── Day 1 ───────────────────────────────────────────────────────
  { title: 'Welcome session & office tour',
    description: 'HR-led walkthrough of the office, introduce key people, explain culture & values.',
    category: 'INTRO', phase: 'DAY1', role: 'HR_ADMIN', dueDays: 0 },

  { title: 'Hand over laptop & ID card',
    description: 'IT walks through device setup + signs equipment register; HR issues ID card.',
    category: 'EQUIPMENT', phase: 'DAY1', role: 'IT', dueDays: 0, blocking: true },

  { title: 'Manager 1:1 — role overview & first goals',
    description: 'Set expectations, intro team, first deliverables, 30-day priorities.',
    category: 'INTRO', phase: 'DAY1', role: 'MANAGER', dueDays: 0 },

  { title: 'Assign onboarding buddy',
    description: 'Peer mentor for the first 30 days — helps with culture, processes, and informal Q&A.',
    category: 'BUDDY', phase: 'DAY1', role: 'HR_ADMIN', dueDays: 0 },

  // ─── Week 1 ──────────────────────────────────────────────────────
  { title: 'Complete compliance trainings',
    description: 'Anti-harassment, data privacy, security awareness — required for all new joiners.',
    category: 'TRAINING', phase: 'WEEK1', role: 'EMPLOYEE', dueDays: 5 },

  { title: 'Buddy lunch / coffee',
    description: 'Informal check-in with assigned buddy.',
    category: 'BUDDY', phase: 'WEEK1', role: 'BUDDY', dueDays: 4 },

  { title: 'Department deep-dive session',
    description: 'Department-level tools, processes, key stakeholders.',
    category: 'TRAINING', phase: 'WEEK1', role: 'MANAGER', dueDays: 3 },

  // ─── 30 Day ──────────────────────────────────────────────────────
  { title: '30-day manager check-in',
    description: 'Reflect on first month, blockers, support needs.',
    category: 'INTRO', phase: 'DAYS_30', role: 'MANAGER', dueDays: 30 },

  { title: '30-day pulse survey',
    description: 'Short feedback survey on onboarding experience.',
    category: 'PAPERWORK', phase: 'DAYS_30', role: 'EMPLOYEE', dueDays: 30 },

  // ─── 60 Day ──────────────────────────────────────────────────────
  { title: '60-day manager check-in',
    description: 'Performance feedback + course-correct if needed.',
    category: 'INTRO', phase: 'DAYS_60', role: 'MANAGER', dueDays: 60 },

  // ─── Probation End ───────────────────────────────────────────────
  { title: '90-day review & confirmation decision',
    description: 'Confirm, extend probation, or part ways. HR is alerted 14 days prior.',
    category: 'PAPERWORK', phase: 'PROBATION_END', role: 'MANAGER', dueDays: 90, blocking: true,
    applyToTypes: ['PERMANENT', 'PROBATION'] },

  { title: 'Issue confirmation letter',
    description: 'Auto-generated confirmation letter for the employee.',
    category: 'PAPERWORK', phase: 'PROBATION_END', role: 'HR_ADMIN', dueDays: 91,
    generateType: 'confirmation_letter',
    applyToTypes: ['PERMANENT', 'PROBATION'] },
]

// ─── OFFBOARDING (anchored to targetEndDate = LAST WORKING DAY) ──────────────
// Negative dueDays = before last day · Positive = after last day

export const OFFBOARDING_TEMPLATE: TaskTemplate[] = [
  // ─── Notice phase (before last day) ─────────────────────────────

  // For termination reasons: Show Cause Notice precedes the Notice Period
  { title: 'Issue Show Cause Notice',
    description: 'Auto-generated. HR fills in specific concerns; lists 3–7 day response window.',
    category: 'LEGAL', phase: 'NOTICE', role: 'HR_ADMIN', dueDays: -45, blocking: true,
    generateType: 'show_cause_notice',
    applyToReasons: ['TERMINATION_PERFORMANCE', 'TERMINATION_MISCONDUCT'] },

  { title: 'Issue Notice Period letter',
    description: 'Auto-generated with last-working-day calculated from notice period.',
    category: 'LEGAL', phase: 'NOTICE', role: 'HR_ADMIN', dueDays: -30, blocking: true,
    generateType: 'notice_period_letter' },

  { title: 'Acknowledge resignation (if employee-initiated)',
    description: 'HR confirms receipt of resignation letter and effective date.',
    category: 'PAPERWORK', phase: 'NOTICE', role: 'HR_ADMIN', dueDays: -30,
    applyToReasons: ['RESIGNATION', 'MUTUAL'] },

  { title: 'Issue Termination Letter',
    description: 'Auto-generated with reason + last working day + F&F amount.',
    category: 'LEGAL', phase: 'NOTICE', role: 'HR_ADMIN', dueDays: -7, blocking: true,
    generateType: 'termination_letter',
    applyToReasons: ['TERMINATION_PERFORMANCE', 'TERMINATION_MISCONDUCT', 'LAYOFF'] },

  { title: 'Send Termination Email',
    description: 'Email copy of termination letter sent to employee + cc reporting manager.',
    category: 'LEGAL', phase: 'NOTICE', role: 'HR_ADMIN', dueDays: -7,
    applyToReasons: ['TERMINATION_PERFORMANCE', 'TERMINATION_MISCONDUCT', 'LAYOFF'] },

  { title: 'Inform team & broader org',
    description: 'Manager announces departure to team; HR sends company-wide note if relevant.',
    category: 'INTRO', phase: 'NOTICE', role: 'MANAGER', dueDays: -25 },

  { title: 'Build knowledge-transfer plan & identify successor',
    description: 'Document responsibilities, ongoing projects, escalation paths. Identify who picks each up.',
    category: 'PAPERWORK', phase: 'NOTICE', role: 'MANAGER', dueDays: -20, blocking: true },

  { title: 'Schedule Exit Interview',
    description: 'HR sets up confidential exit interview in the final week.',
    category: 'EXIT_INTERVIEW', phase: 'NOTICE', role: 'HR_ADMIN', dueDays: -7 },

  { title: 'Calculate Full & Final (F&F) settlement',
    description: 'Final salary + unused leave encashment + bonuses − advances − pending dues.',
    category: 'FNF', phase: 'NOTICE', role: 'FINANCE', dueDays: -3, blocking: true },

  // ─── Last Day ────────────────────────────────────────────────────
  { title: 'Conduct Exit Interview',
    description: 'Auto-generated blank fillable form. Confidential session — reasons, feedback, suggestions.',
    category: 'EXIT_INTERVIEW', phase: 'LAST_DAY', role: 'HR_ADMIN', dueDays: 0,
    generateType: 'exit_interview_form' },

  { title: 'Complete Exit Clearance Form',
    description: 'Auto-generated multi-department sign-off — IT, Finance, Manager, HR.',
    category: 'PAPERWORK', phase: 'LAST_DAY', role: 'HR_ADMIN', dueDays: 0, blocking: true,
    generateType: 'exit_clearance_form' },

  { title: 'Return all company assets',
    description: 'Laptop, ID card, access keys, peripherals — IT records condition on the Exit Clearance Form.',
    category: 'ASSET_RETURN', phase: 'LAST_DAY', role: 'IT', dueDays: 0, blocking: true },

  { title: 'Revoke system access',
    description: 'Disable email, Slack, code repos, payroll/HR tools, building access — log timestamps.',
    category: 'SYSTEM_ACCESS', phase: 'LAST_DAY', role: 'IT', dueDays: 0, blocking: true },

  { title: 'NDA & confidentiality reminder',
    description: 'Reacknowledge NDA — confidentiality obligations carry on after departure.',
    category: 'LEGAL', phase: 'LAST_DAY', role: 'EMPLOYEE', dueDays: 0,
    generateType: 'nda' },

  { title: 'Issue Experience Letter',
    description: 'Auto-generated with dates of employment, role, and tenure calculation.',
    category: 'PAPERWORK', phase: 'LAST_DAY', role: 'HR_ADMIN', dueDays: 0,
    generateType: 'experience_letter' },

  // ─── Post-Departure ──────────────────────────────────────────────
  { title: 'Process F&F payment',
    description: 'Disburse final settlement within the agreed window (typically 30 days from last day).',
    category: 'FNF', phase: 'POST', role: 'FINANCE', dueDays: 7, blocking: true },

  { title: 'Update HRIS — set status SEPARATED + alumni flag',
    description: 'Final HRIS hygiene + decision on re-hire eligibility flag.',
    category: 'PAPERWORK', phase: 'POST', role: 'HR_ADMIN', dueDays: 2 },
]

// ─── Phase metadata ──────────────────────────────────────────────────────────

export const PHASES_ONBOARDING = [
  { key: 'PRE_DAY1',       label: 'Pre-Day 1',     description: 'Documents, agreements & setup before joining' },
  { key: 'DAY1',           label: 'Day 1',          description: 'First day events' },
  { key: 'WEEK1',          label: 'Week 1',         description: 'First week settling in' },
  { key: 'DAYS_30',        label: '30 Days',        description: 'First-month check-in' },
  { key: 'DAYS_60',        label: '60 Days',        description: 'Mid-probation review' },
  { key: 'PROBATION_END',  label: 'Probation End',  description: '90-day confirmation' },
]

export const PHASES_OFFBOARDING = [
  { key: 'NOTICE',   label: 'Notice Period',  description: 'Show cause / notice / handover' },
  { key: 'LAST_DAY', label: 'Last Day',       description: 'Exit interview · clearance · final docs' },
  { key: 'POST',     label: 'Post-Departure', description: 'F&F payment + HRIS finalisation' },
]

// ─── Labels ──────────────────────────────────────────────────────────────────

export const ROLE_LABELS: Record<TaskRole, string> = {
  HR_ADMIN: 'HR',
  MANAGER: 'Manager',
  IT: 'IT',
  FINANCE: 'Finance',
  EMPLOYEE: 'Employee',
  BUDDY: 'Buddy',
}

export const CATEGORY_LABELS: Record<string, string> = {
  PAPERWORK:       'Paperwork',
  EQUIPMENT:       'Equipment',
  SYSTEM_ACCESS:   'System Access',
  TRAINING:        'Training',
  INTRO:           'Introductions',
  EXIT_INTERVIEW:  'Exit Interview',
  ASSET_RETURN:    'Asset Return',
  FNF:             'Final Settlement',
  LEGAL:           'Legal & NDA',
  BUDDY:           'Buddy Programme',
}

// ─── Expansion helper ────────────────────────────────────────────────────────

export function expandTemplate(
  template: TaskTemplate[],
  anchorDate: Date,
  context: { employeeType?: string; reason?: string } = {},
): {
  title: string
  description?: string | null
  category: string
  phase: string
  assignedToRole: string
  dueDate: Date | null
  blocking: boolean
  sortOrder: number
  notes?: string | null
}[] {
  const filtered = template.filter((t) => {
    if (t.applyToTypes && context.employeeType && !t.applyToTypes.includes(context.employeeType)) {
      return false
    }
    if (t.applyToReasons && context.reason && !t.applyToReasons.includes(context.reason)) {
      return false
    }
    if (t.applyToReasons && !context.reason) {
      // Skip reason-conditional tasks if no reason given
      return false
    }
    return true
  })

  return filtered.map((t, idx) => {
    const due = new Date(anchorDate)
    due.setDate(due.getDate() + t.dueDays)
    // Stash template URL + upload requirement in `notes` so the UI can surface them
    // without needing a schema change. Format: JSON.
    const meta: Record<string, unknown> = {}
    if (t.templateUrl) meta.templateUrl = t.templateUrl
    if (t.generateType) meta.generateType = t.generateType
    if (t.requiresUpload) meta.requiresUpload = true
    return {
      title: t.title,
      description: t.description ?? null,
      category: t.category,
      phase: t.phase,
      assignedToRole: t.role,
      dueDate: due,
      blocking: !!t.blocking,
      sortOrder: idx,
      notes: Object.keys(meta).length ? JSON.stringify(meta) : null,
    }
  })
}
