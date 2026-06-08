/**
 * Talent Pool helpers.
 *
 *   - autoTags(candidate, requisition) — derives role-family, seniority,
 *     and source tags from existing data.
 *   - freshnessTag(updatedAt) — Hot / Warm / Cold based on last contact.
 *   - shouldAutoPool(candidate) — true when a rejected candidate is
 *     strong enough to keep around.
 *
 * Tags are stored as a comma-separated string on Candidate.poolTags so
 * filtering is a single LIKE query and there's no extra table to manage.
 */

interface CandidateLike {
  experience?: number | null
  source?: string | null
  matchScore?: number | null
  currentRole?: string | null
  currentCompany?: string | null
  notes?: string | null
}

interface RequisitionLike {
  title: string
  type: string
}

const ROLE_FAMILY_KEYWORDS: Record<string, string[]> = {
  'UI/UX':         ['ui/ux', 'designer', 'figma', 'ux', 'ui'],
  'Shopify Dev':   ['shopify', 'liquid', 'theme'],
  'WordPress':     ['wordpress', 'wp', 'elementor'],
  'Frontend':      ['frontend', 'react', 'next.js', 'vue'],
  'Backend':       ['backend', 'node', 'api', 'database'],
  'CRO':           ['cro', 'optimisation', 'optimization', 'conversion'],
  'Marketing':     ['marketing', 'paid', 'media', 'meta ads', 'google ads'],
  'BD / Sales':    ['business development', 'bd ', 'sales', 'account'],
  'HR / Ops':      ['human resource', 'hr ', 'operations', 'admin'],
}

function detectRoleFamily(role: string, fallbackTitle: string): string | null {
  const txt = (role + ' ' + fallbackTitle).toLowerCase()
  for (const [family, kws] of Object.entries(ROLE_FAMILY_KEYWORDS)) {
    if (kws.some((k) => txt.includes(k))) return family
  }
  return null
}

function detectSeniority(exp: number | null | undefined): string | null {
  if (exp == null) return null
  if (exp < 1) return 'Junior'
  if (exp < 3) return 'Mid'
  if (exp < 6) return 'Senior'
  return 'Lead'
}

/** Compute the set of auto-tags for a pool candidate. */
export function autoTags(c: CandidateLike, r: RequisitionLike): string[] {
  const tags: string[] = []
  const family = detectRoleFamily(c.currentRole ?? '', r.title)
  if (family) tags.push(family)
  const seniority = detectSeniority(c.experience)
  if (seniority) tags.push(seniority)
  if (c.source === 'REFERRAL') tags.push('Referred')
  if ((c.matchScore ?? 0) >= 80) tags.push('Top Match')
  return tags
}

/** Returns 'Hot' / 'Warm' / 'Cold' from the last update. */
export function freshnessTag(updatedAt: Date): 'Hot' | 'Warm' | 'Cold' {
  const days = (Date.now() - new Date(updatedAt).getTime()) / 86400_000
  if (days < 30)  return 'Hot'
  if (days < 180) return 'Warm'
  return 'Cold'
}

/** Decide whether to auto-add a candidate to the pool on rejection.
 *  Threshold is per-role (JobRequisition.scoreThreshold, default 60). */
export function shouldAutoPool(c: CandidateLike, threshold = 60): boolean {
  return (c.matchScore ?? 0) >= threshold
}
