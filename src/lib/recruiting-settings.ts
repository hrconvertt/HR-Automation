/**
 * Recruiting settings — the switches for the module, in one place.
 *
 * Each key carries its own label and explanation so the settings screen is
 * generated from this list rather than hand-laid-out. Adding a switch means
 * adding a line here, not a line here and three more in the page.
 *
 * Where a setting is not wired into anything yet, it says so in its own
 * `pending` note and the screen shows it greyed. A toggle that silently does
 * nothing is worse than no toggle.
 */

export type SettingSpec =
  | { type: 'boolean'; group: string; label: string; help: string; pending?: string }
  | { type: 'number'; group: string; label: string; help: string; min?: number; max?: number; unit?: string; pending?: string }
  | { type: 'string'; group: string; label: string; help: string; placeholder?: string; pending?: string }

export const RECRUITING_SETTING_KEYS: Record<string, SettingSpec> = {
  // ── Sharing a published role ─────────────────────────────────────────
  socialConnectEnabled: {
    type: 'boolean', group: 'Sharing',
    label: 'Social sharing',
    help: 'Show the LinkedIn, WhatsApp and X buttons on a published job description.',
  },
  shareLinkedIn: {
    type: 'boolean', group: 'Sharing',
    label: 'LinkedIn',
    help: 'Opens LinkedIn’s composer with the careers link filled in.',
  },
  shareWhatsApp: {
    type: 'boolean', group: 'Sharing',
    label: 'WhatsApp',
    help: 'Share a role into a group or a candidate chat.',
  },
  shareTwitter: {
    type: 'boolean', group: 'Sharing',
    label: 'X / Twitter',
    help: 'Rarely used for hiring here, so it is off by default.',
  },
  careersPagePublic: {
    type: 'boolean', group: 'Sharing',
    label: 'Public careers page',
    help: 'Publishing a JD puts the role on convertt.co/careers where anyone can apply.',
  },

  // ── Screening ────────────────────────────────────────────────────────
  autoScreenOnApply: {
    type: 'boolean', group: 'Screening',
    label: 'Score CVs on arrival',
    help: 'Run the AI screen as soon as a CV lands, rather than waiting to be asked.',
    pending: 'Needs ANTHROPIC_API_KEY set in Vercel.',
  },
  scoreThreshold: {
    type: 'number', group: 'Screening', min: 0, max: 100, unit: '/100',
    label: 'Shortlist score',
    help: 'At or above this, a candidate is worth a call. Used as the default on new roles.',
  },
  talentPoolThreshold: {
    type: 'number', group: 'Screening', min: 0, max: 100, unit: '/100',
    label: 'Talent pool score',
    help: 'Strong candidates for a role they did not get are kept for the next one.',
  },
  autoRejectBelow: {
    type: 'number', group: 'Screening', min: 0, max: 100, unit: '/100',
    label: 'Auto-reject below',
    help: 'Zero turns it off. Anything above zero moves candidates without a person looking.',
  },
  readJdForFilters: {
    type: 'boolean', group: 'Screening',
    label: 'Read the JD for knockout filters',
    help: 'Fill the filter dialog in from the job description instead of typing it again.',
  },

  // ── Candidates ───────────────────────────────────────────────────────
  notifyOnApplication: {
    type: 'boolean', group: 'Candidates',
    label: 'Tell me about new applicants',
    help: 'A notification when someone applies to an open role.',
  },
  autoAcknowledgeApplication: {
    type: 'boolean', group: 'Candidates',
    label: 'Acknowledge applications',
    help: 'Send a short thank-you the moment an application arrives.',
    pending: 'Needs SMTP configured — no mail can leave the system yet.',
  },
  rejectionEmails: {
    type: 'boolean', group: 'Candidates',
    label: 'Send rejections',
    help: 'Let the system write and send the "not this time" note.',
    pending: 'Needs SMTP configured — no mail can leave the system yet.',
  },
  stuckAfterDays: {
    type: 'number', group: 'Candidates', min: 1, max: 60, unit: ' days',
    label: 'Call a candidate stuck after',
    help: 'How long without movement before they show as stuck on Analytics.',
  },

  // ── Hiring process ───────────────────────────────────────────────────
  requireLeadApproval: {
    type: 'boolean', group: 'Hiring process',
    label: 'Lead approves before HR',
    help: 'A hiring request goes to the reporting manager first, then to HR.',
  },
  defaultCurrency: {
    type: 'string', group: 'Hiring process',
    label: 'Job post currency',
    help: 'What new job-post payments are recorded in. LinkedIn bills Convertt in AED.',
    placeholder: 'AED',
  },
}

export const DEFAULT_RECRUITING_SETTINGS: Record<string, boolean | number | string> = {
  socialConnectEnabled: true,
  shareLinkedIn: true,
  shareWhatsApp: true,
  shareTwitter: false,
  careersPagePublic: true,

  autoScreenOnApply: false,
  scoreThreshold: 60,
  talentPoolThreshold: 75,
  autoRejectBelow: 0,
  readJdForFilters: true,

  notifyOnApplication: true,
  autoAcknowledgeApplication: false,
  rejectionEmails: false,
  stuckAfterDays: 7,

  requireLeadApproval: true,
  defaultCurrency: 'AED',
}

export const SETTING_GROUPS = ['Sharing', 'Screening', 'Candidates', 'Hiring process']
