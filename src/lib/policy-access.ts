/**
 * Shared access logic for the Policies module.
 *
 * Audience rules (`PolicyDocument.audience`):
 *   - ALL       → every employee
 *   - MANAGERS  → users whose role is MANAGER (or who manage at least one report)
 *   - HR_ONLY   → users whose role is HR_ADMIN
 *
 * Visibility:
 *   - HR_ADMIN          → can see any policy at any status (DRAFT / PUBLISHED / ARCHIVED)
 *   - Everyone else     → only PUBLISHED policies whose audience includes them
 */

type Policy = {
  status: string
  audience: string
  audienceRoles?: string | null
}

export const DEFAULT_AUDIENCE_ROLES = ['EMPLOYEE', 'LEAD', 'MANAGER', 'EXECUTIVE', 'FINANCE']
export const ALLOWED_AUDIENCE_ROLES = ['EMPLOYEE', 'LEAD', 'MANAGER', 'EXECUTIVE', 'FINANCE']

/**
 * Parse the JSON-encoded audienceRoles column.
 * Falls back to "everyone (non-HR)" for null / missing / malformed values,
 * so legacy rows behave like the previous "visible to all" default.
 */
export function parseAudienceRoles(s: string | null | undefined): string[] {
  if (!s) return [...DEFAULT_AUDIENCE_ROLES]
  try {
    const parsed = JSON.parse(s)
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
      return parsed
    }
    return [...DEFAULT_AUDIENCE_ROLES]
  } catch {
    return [...DEFAULT_AUDIENCE_ROLES]
  }
}

/**
 * Heuristic recommender — given a policy title + type, suggest which roles
 * should see it. HR reviews + tweaks before saving.
 *
 * Match order: most specific keyword → fall back to type → fall back to "everyone".
 */
const RECOMMENDATION_RULES: Array<{ match: RegExp; audience: string[]; rationale: string }> = [
  // Confidential / HR-only
  { match: /\b(termination|show ?cause|disciplinary|grievance|investigation|fraud|whistleblow.*confidential)\b/i,
    audience: ['HR_ADMIN'],
    rationale: 'Confidential disciplinary matter — restrict to HR.' },

  // Compensation strategy / bands → HR + Exec + Finance only
  { match: /\b(compensation ?(band|strategy|guideline)|salary ?band|increment ?policy|bonus ?policy|retention ?bonus)\b/i,
    audience: ['HR_ADMIN', 'EXECUTIVE', 'FINANCE'],
    rationale: 'Compensation strategy — sensitive financial detail.' },

  // Management process / calibration
  { match: /\b(calibration|pip ?(procedure|guideline)|manager ?(playbook|workflow)|hire ?(workflow|playbook)|performance ?review.*manager)\b/i,
    audience: ['HR_ADMIN', 'MANAGER', 'LEAD', 'EXECUTIVE'],
    rationale: 'Manager-facing process — leads + managers + executives.' },

  // Finance / payroll mechanics
  { match: /\b(payroll ?(process|deduction)|tax ?(filing|policy)|reimbursement|eobi|expense ?approval)\b/i,
    audience: ['HR_ADMIN', 'FINANCE', 'EXECUTIVE', 'EMPLOYEE'],
    rationale: 'Pay-related — finance owns, everyone affected.' },

  // Code of Conduct / handbook / general policies → everyone
  { match: /\b(code ?of ?conduct|handbook|anti[- ]?harassment|whistleblower|equal ?opportunity|diversity)\b/i,
    audience: ['EMPLOYEE', 'LEAD', 'MANAGER', 'EXECUTIVE', 'FINANCE'],
    rationale: 'Standard conduct policy — visible to everyone.' },

  // Attendance / leave / WFH
  { match: /\b(attendance|punctuality|leave|wfh|work ?from ?home|remote|holiday)\b/i,
    audience: ['EMPLOYEE', 'LEAD', 'MANAGER', 'EXECUTIVE', 'FINANCE'],
    rationale: 'Daily operations — visible to everyone.' },

  // Travel / expense / IT
  { match: /\b(travel|expense|business ?trip|it ?(policy|acceptable ?use)|security ?policy|byod)\b/i,
    audience: ['EMPLOYEE', 'LEAD', 'MANAGER', 'EXECUTIVE', 'FINANCE'],
    rationale: 'Universal operating rule.' },

  // Probation / confirmation
  { match: /\b(probation|confirmation|onboarding ?policy|new ?hire)\b/i,
    audience: ['EMPLOYEE', 'LEAD', 'MANAGER', 'EXECUTIVE', 'FINANCE'],
    rationale: 'New-hire facing — everyone should see.' },
]

const TYPE_DEFAULTS: Record<string, { audience: string[]; rationale: string }> = {
  CODE_OF_CONDUCT: {
    audience: ['EMPLOYEE', 'LEAD', 'MANAGER', 'EXECUTIVE', 'FINANCE'],
    rationale: 'Code of Conduct — visible to everyone.',
  },
  HR_POLICY: {
    audience: ['EMPLOYEE', 'LEAD', 'MANAGER', 'EXECUTIVE', 'FINANCE'],
    rationale: 'Standard HR policy — visible to everyone.',
  },
  COMPENSATION_POLICY: {
    audience: ['HR_ADMIN', 'EXECUTIVE', 'FINANCE'],
    rationale: 'Compensation policy — HR / Finance / Exec only.',
  },
  CONFIDENTIAL: {
    audience: ['HR_ADMIN'],
    rationale: 'Confidential — HR only.',
  },
}

export function recommendAudience(
  title: string,
  type?: string | null,
): { audience: string[]; rationale: string } {
  // 1. Try keyword rules on the title (most specific).
  for (const rule of RECOMMENDATION_RULES) {
    if (rule.match.test(title)) {
      return { audience: rule.audience, rationale: rule.rationale }
    }
  }
  // 2. Fall back to type-based default.
  if (type && TYPE_DEFAULTS[type]) {
    return TYPE_DEFAULTS[type]
  }
  // 3. Default: everyone.
  return {
    audience: [...DEFAULT_AUDIENCE_ROLES],
    rationale: "No specific signal — defaulted to everyone. Tighten if it's sensitive.",
  }
}

export function canSeePolicy(
  policy: Policy,
  role: string,
): boolean {
  if (role === 'HR_ADMIN') return true
  if (policy.status !== 'PUBLISHED' && policy.status !== 'ACTIVE') return false
  // New per-role audience takes precedence.
  const audienceRoles = parseAudienceRoles(policy.audienceRoles ?? null)
  if (!audienceRoles.includes(role)) return false
  // Legacy coarse audience still respected: HR_ONLY hides from non-HR;
  // MANAGERS-only hides from anyone whose role isn't MANAGER.
  if (policy.audience === 'HR_ONLY') return false
  if (policy.audience === 'MANAGERS' && role !== 'MANAGER') return false
  return true
}

/** Can this user acknowledge this policy? Stricter than canSee — must be in audience and policy must be PUBLISHED. */
export function canAcknowledgePolicy(
  policy: Policy,
  role: string,
): boolean {
  if (policy.status !== 'PUBLISHED') return false
  if (policy.audience === 'ALL') return true
  if (policy.audience === 'MANAGERS' && role === 'MANAGER') return true
  if (policy.audience === 'HR_ONLY' && role === 'HR_ADMIN') return true
  return false
}

/**
 * Resolve a policy audience string to the list of ACTIVE employee IDs that
 * should be enrolled (i.e., get a PENDING acknowledgement row).
 *
 *   ALL      → every active employee
 *   MANAGERS → employees whose linked user has role=MANAGER, OR who have ≥1
 *              direct report (covers managers without a User record too)
 *   HR_ONLY  → employees whose linked user has role=HR_ADMIN
 *
 * This must stay aligned with `canSeePolicy` so visibility and enrolment agree.
 */
import type { PrismaClient } from '@prisma/client'
export async function resolveAudienceEmployeeIds(
  prisma: PrismaClient,
  audience: string,
): Promise<string[]> {
  if (audience === 'ALL') {
    const all = await prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    })
    return all.map((e) => e.id)
  }
  if (audience === 'MANAGERS') {
    // Union of: (a) employees with user.role=MANAGER, (b) anyone listed as a reportingManager
    const [byRole, byReports] = await Promise.all([
      prisma.employee.findMany({
        where: { status: 'ACTIVE', user: { role: 'MANAGER' } },
        select: { id: true },
      }),
      prisma.employee.findMany({
        where: { status: 'ACTIVE', directReports: { some: {} } },
        select: { id: true },
      }),
    ])
    return Array.from(new Set([...byRole.map((e) => e.id), ...byReports.map((e) => e.id)]))
  }
  if (audience === 'HR_ONLY') {
    const hr = await prisma.employee.findMany({
      where: { status: 'ACTIVE', user: { role: 'HR_ADMIN' } },
      select: { id: true },
    })
    return hr.map((e) => e.id)
  }
  return []
}
