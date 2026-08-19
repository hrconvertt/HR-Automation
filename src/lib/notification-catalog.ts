/**
 * Every notification the system can send, named in plain English.
 *
 * The settings screen used to offer seven category switches, which meant
 * turning off "Payroll" to stop a reminder also turned off the payslip. This
 * lists each notification individually, grouped for scanning, so a switch does
 * exactly one thing.
 *
 * A type absent from here still sends — the catalogue is for the settings UI,
 * not a whitelist. Adding a NotificationType and forgetting this file makes it
 * unconfigurable, not undeliverable.
 */

import type { NotificationType } from '@/lib/notifications'

export const NOTIFICATION_GROUPS = [
  'LEAVE', 'ATTENDANCE', 'PAYROLL', 'PERFORMANCE', 'CONDUCT',
  'LIFECYCLE', 'RECRUITING', 'CELEBRATIONS', 'DOCUMENTS', 'GENERAL',
] as const
export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number]

export const GROUP_LABELS: Record<NotificationGroup, string> = {
  LEAVE: 'Leave & time off',
  ATTENDANCE: 'Attendance',
  PAYROLL: 'Pay',
  PERFORMANCE: 'Performance & goals',
  CONDUCT: 'Conduct',
  LIFECYCLE: 'Joining & leaving',
  RECRUITING: 'Recruiting',
  CELEBRATIONS: 'Celebrations',
  DOCUMENTS: 'Policies & documents',
  GENERAL: 'Everything else',
}

export interface NotificationSpec {
  type: string
  group: NotificationGroup
  label: string
  /** When it fires. Written for the person choosing, not the developer. */
  when: string
  /** Some notifications should be hard to turn off. */
  important?: boolean
}

export const NOTIFICATION_CATALOG: NotificationSpec[] = [
  // ── Leave ────────────────────────────────────────────────────────────────
  { type: 'LEAVE_SUBMITTED', group: 'LEAVE', label: 'Leave requested',
    when: 'Somebody in your team submits a leave request' },
  { type: 'LEAVE_APPROVED', group: 'LEAVE', label: 'Leave approved',
    when: 'Your leave request is approved' },
  { type: 'LEAVE_REJECTED', group: 'LEAVE', label: 'Leave declined',
    when: 'Your leave request is declined' },

  // ── Attendance ───────────────────────────────────────────────────────────
  { type: 'ATTENDANCE_CORRECTION_APPROVED', group: 'ATTENDANCE', label: 'Attendance correction approved',
    when: 'HR accepts a correction you raised on your own attendance' },
  { type: 'ATTENDANCE_CORRECTION_REJECTED', group: 'ATTENDANCE', label: 'Attendance correction declined',
    when: 'HR declines a correction you raised' },
  { type: 'OVERTIME_APPROVED', group: 'ATTENDANCE', label: 'Overtime approved',
    when: 'Overtime hours are signed off — this is money', important: true },
  { type: 'OVERTIME_REJECTED', group: 'ATTENDANCE', label: 'Overtime declined',
    when: 'Overtime hours are not approved — hours you will not be paid for', important: true },
  { type: 'ANOMALY', group: 'ATTENDANCE', label: 'Attendance anomaly',
    when: 'Something does not add up — a clock-in on a leave day, a missing punch' },

  // ── Pay ──────────────────────────────────────────────────────────────────
  { type: 'PAYSLIP_READY', group: 'PAYROLL', label: 'Salary slip ready',
    when: 'Payroll is approved and your slip is available', important: true },
  { type: 'SALARY_CHANGED', group: 'PAYROLL', label: 'Salary changed',
    when: 'Your compensation is revised — an increment, promotion or adjustment', important: true },
  { type: 'INCREMENT_LETTER', group: 'PAYROLL', label: 'Increment letter issued',
    when: 'An increment letter is generated for you', important: true },

  // ── Performance ──────────────────────────────────────────────────────────
  { type: 'REVIEW_CYCLE_OPENED', group: 'PERFORMANCE', label: 'Review cycle opened',
    when: 'HR opens a review cycle' },
  { type: 'REVIEW_SELF_DUE', group: 'PERFORMANCE', label: 'Self-appraisal due',
    when: 'Your self-appraisal is waiting on you' },
  { type: 'REVIEW_SELF_SUBMITTED', group: 'PERFORMANCE', label: 'Self-appraisal submitted',
    when: 'Someone reporting to you submits their self-appraisal' },
  { type: 'REVIEW_MGR_SUBMITTED', group: 'PERFORMANCE', label: 'Manager review submitted',
    when: 'A manager finishes their side of a review' },
  { type: 'REVIEW_FINALIZED', group: 'PERFORMANCE', label: 'Review finalised',
    when: 'Your review is finalised and visible to you' },
  { type: 'GOAL_ASSIGNED', group: 'PERFORMANCE', label: 'Goal assigned',
    when: 'A goal is set for you' },
  { type: 'GOAL_COMMENT', group: 'PERFORMANCE', label: 'Goal comment',
    when: 'Someone comments on one of your goals' },
  { type: 'PROBATION_ALERT', group: 'PERFORMANCE', label: 'Probation ending',
    when: 'A probation period ends within 14 days' },
  { type: 'APPRAISAL_FORM_DUE', group: 'PERFORMANCE', label: 'Appraisal form due',
    when: 'An appraisal form is generated 10 days ahead of a confirmation or increment' },

  // ── Conduct ──────────────────────────────────────────────────────────────
  { type: 'SHOW_CAUSE_ISSUED', group: 'CONDUCT', label: 'Show-cause notice issued',
    when: 'A show-cause notice is issued to you', important: true },
  { type: 'SHOW_CAUSE_RESOLVED', group: 'CONDUCT', label: 'Show-cause resolved',
    when: 'A show-cause notice against you is closed' },
  { type: 'SHOW_CAUSE_ESCALATED', group: 'CONDUCT', label: 'Show-cause escalated',
    when: 'A show-cause notice is escalated', important: true },
  { type: 'PIP_CREATED', group: 'CONDUCT', label: 'Improvement plan started',
    when: 'A performance improvement plan is opened', important: true },
  { type: 'PIP_UPDATED', group: 'CONDUCT', label: 'Improvement plan check-in',
    when: 'A check-in is added to an improvement plan' },
  { type: 'SANDWICH_WARNING', group: 'CONDUCT', label: 'Sandwich-rule warning',
    when: 'A sandwich deduction and warning letter is raised', important: true },

  // ── Joining & leaving ────────────────────────────────────────────────────
  { type: 'ONBOARDING_TASK', group: 'LIFECYCLE', label: 'Onboarding task',
    when: 'An onboarding task is assigned or falls due' },
  { type: 'NEW_HIRE', group: 'LIFECYCLE', label: 'New joiner',
    when: 'Someone new joins the company' },
  { type: 'EXIT_CLEARANCE', group: 'LIFECYCLE', label: 'Exit clearance',
    when: 'A clearance step needs your sign-off' },
  { type: 'PROMOTION', group: 'LIFECYCLE', label: 'Promotion',
    when: 'A promotion is approved or announced' },

  // ── Recruiting ───────────────────────────────────────────────────────────
  { type: 'HIRING_REQUEST', group: 'RECRUITING', label: 'Hiring request raised',
    when: 'A manager raises a requisition' },
  { type: 'HIRING_REQUEST_DECISION', group: 'RECRUITING', label: 'Hiring request decided',
    when: 'A requisition is approved or declined' },
  { type: 'JOB_POST_CLOSING', group: 'RECRUITING', label: 'Job post closing',
    when: 'A published job post is about to expire' },
  { type: 'INTERVIEW_SCHEDULED', group: 'RECRUITING', label: 'Interview scheduled',
    when: 'You are put on an interview panel' },

  // ── Celebrations ─────────────────────────────────────────────────────────
  { type: 'BIRTHDAY', group: 'CELEBRATIONS', label: 'Birthdays',
    when: 'A colleague has a birthday' },
  { type: 'ANNIVERSARY', group: 'CELEBRATIONS', label: 'Work anniversaries',
    when: 'A colleague reaches another year' },
  { type: 'KUDOS', group: 'CELEBRATIONS', label: 'Kudos',
    when: 'Someone gives you kudos' },
  { type: 'EVENT_UPCOMING', group: 'CELEBRATIONS', label: 'Company events',
    when: 'A company event is coming up' },

  // ── Policies & documents ─────────────────────────────────────────────────
  { type: 'POLICY_PUBLISHED', group: 'DOCUMENTS', label: 'New policy',
    when: 'A policy is published to you' },
  { type: 'POLICY_ACK_DUE', group: 'DOCUMENTS', label: 'Policy needs signing',
    when: 'A policy is waiting on your acknowledgment', important: true },
  { type: 'DOCUMENT_EXPIRING', group: 'DOCUMENTS', label: 'Document expiring',
    when: 'A document on your file — CNIC, visa, contract — is close to expiry' },
  { type: 'LETTER_READY', group: 'DOCUMENTS', label: 'Letter ready',
    when: 'A letter you requested has been issued' },

  // ── Everything else ──────────────────────────────────────────────────────
  { type: 'TICKET_UPDATE', group: 'GENERAL', label: 'Help desk replies',
    when: 'There is an update on a ticket you raised' },
  { type: 'DAILY_SUMMARY', group: 'GENERAL', label: 'Daily summary',
    when: 'A once-a-day digest of what needs you' },
  { type: 'GENERAL', group: 'GENERAL', label: 'Announcements',
    when: 'Anything else HR sends to everyone' },
]

export const CATALOG_BY_TYPE = new Map(NOTIFICATION_CATALOG.map((n) => [n.type, n]))

export function groupedCatalog(): Array<{ group: NotificationGroup; items: NotificationSpec[] }> {
  return NOTIFICATION_GROUPS
    .map((group) => ({ group, items: NOTIFICATION_CATALOG.filter((n) => n.group === group) }))
    .filter((g) => g.items.length > 0)
}

/** Whether a type may be switched off at all. */
export function isConfigurable(type: string): boolean {
  return CATALOG_BY_TYPE.has(type)
}

// ── Theme and sound ─────────────────────────────────────────────────────────

export const THEMES = ['LIGHT', 'DARK', 'SYSTEM'] as const
export type Theme = (typeof THEMES)[number]

export const THEME_LABELS: Record<Theme, { label: string; hint: string }> = {
  LIGHT: { label: 'Light', hint: 'Always light, whatever the device is set to' },
  DARK: { label: 'Dark', hint: 'Always dark' },
  SYSTEM: { label: 'System default', hint: 'Follows your phone or computer' },
}

export const NOTIFICATION_SOUNDS = ['NONE', 'CHIME', 'PING', 'KNOCK'] as const
export type NotificationSound = (typeof NOTIFICATION_SOUNDS)[number]

export const SOUND_LABELS: Record<NotificationSound, string> = {
  NONE: 'Silent', CHIME: 'Chime', PING: 'Ping', KNOCK: 'Knock',
}

/** Types every notification sender should treat as unmutable. */
export function isImportant(type: string): boolean {
  return CATALOG_BY_TYPE.get(type)?.important ?? false
}

export type { NotificationType }
