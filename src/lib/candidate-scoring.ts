/**
 * Candidate scoring — deterministic, rule-based.
 *
 * Inputs:
 *   - candidate: { experience, currentCompany, currentRole, source, notes, cvUrl, fullName }
 *   - requisition: { title, type, jdContent }
 *
 * Output:
 *   - score (0-100, integer)
 *   - reason (short human-readable explainer)
 *
 * The score is the SUM of weighted signals. We cap at 100. Each signal
 * is small (+5 to +20) so no single thing carries the whole score.
 *
 * Buckets the UI cares about:
 *    80-100 → 🟢 Strong (top of pipeline)
 *    60-79  → 🟡 Worth a call
 *    40-59  → 🟠 Maybe
 *    0-39   → 🔴 Probably filter out
 *
 * Phase D upgrade: swap this whole helper for a Claude API call when an
 * Anthropic key is configured. Same signature; same return shape.
 */

interface ScoredCandidate {
  experience?: number | null
  currentCompany?: string | null
  currentRole?: string | null
  source?: string | null
  notes?: string | null
  cvUrl?: string | null
  fullName?: string
}

interface ScoredRequisition {
  title: string
  type: string
  jdContent?: string | null
}

interface Result {
  score: number
  reason: string
}

// Title → expected years (must mirror jd-generator.ts's EXP_LINE).
function expectedExperienceFromTitle(title: string): { min: number; ideal: number } {
  const t = title.toLowerCase()
  if (t.includes('intern') || t.includes('trainee')) return { min: 0, ideal: 0.5 }
  if (t.includes('junior') || t.match(/\bjr\.?\b/) || t.includes('associate')) return { min: 1, ideal: 1.5 }
  if (t.includes('senior') || t.match(/\bsr\.?\b/)) return { min: 4, ideal: 6 }
  if (t.includes('lead') || t.includes('head') || t.includes('manager') || t.includes('principal') || t.includes('director')) return { min: 6, ideal: 8 }
  return { min: 2, ideal: 4 } // mid-level default
}

// Pull a set of keywords from the JD's "What We're Looking For" + Nice
// to Have sections — used for cheap keyword-overlap scoring.
function jdKeywords(jd: string | null | undefined): Set<string> {
  if (!jd) return new Set()
  // Heuristic: take all bullets, lowercase, split on word boundaries,
  // keep tokens 3+ chars, drop common English stopwords.
  const STOP = new Set([
    'and','the','for','with','you','your','our','have','this','that','from','will','can',
    'has','are','was','were','their','they','them','about','some','any','than','what',
    'over','under','also','must','should','strong','work','years','year','team','role',
    'role.','design','using','plus','high','quality','fast','clear','clean','etc',
  ])
  const tokens = new Set<string>()
  jd.toLowerCase().split(/[^a-z0-9+#.]+/).forEach((t) => {
    const trimmed = t.replace(/^[.+#]+|[.+#]+$/g, '')
    if (trimmed.length >= 3 && !STOP.has(trimmed)) tokens.add(trimmed)
  })
  return tokens
}

function tokenize(text: string | null | undefined): Set<string> {
  if (!text) return new Set()
  const out = new Set<string>()
  text.toLowerCase().split(/[^a-z0-9+#.]+/).forEach((t) => {
    const trimmed = t.replace(/^[.+#]+|[.+#]+$/g, '')
    if (trimmed.length >= 3) out.add(trimmed)
  })
  return out
}

export function scoreCandidate(
  candidate: ScoredCandidate,
  requisition: ScoredRequisition,
): Result {
  const reasons: string[] = []
  let score = 30 // baseline — completing the form at all gets a floor

  // ─── 1. Experience match (max +30) ──────────────────────────────
  const { min, ideal } = expectedExperienceFromTitle(requisition.title)
  const exp = candidate.experience ?? null
  if (exp == null) {
    reasons.push('no exp listed')
  } else if (exp >= ideal) {
    score += 30
    reasons.push(`+30 exp ≥ ideal ${ideal}y`)
  } else if (exp >= min) {
    // Linear interp between min and ideal.
    const range = Math.max(0.1, ideal - min)
    const partial = Math.round(15 + 15 * ((exp - min) / range))
    score += partial
    reasons.push(`+${partial} exp ${exp}y in [${min}-${ideal}]`)
  } else if (exp >= min - 1) {
    score += 8
    reasons.push(`+8 exp ${exp}y slightly under min ${min}y`)
  } else {
    reasons.push(`exp ${exp}y << min ${min}y`)
  }

  // ─── 2. Keyword overlap with JD (max +25) ───────────────────────
  // Match candidate's notes + current role + current company against the
  // JD's text. The more terms overlap, the higher the bump.
  const jdSet = jdKeywords(requisition.jdContent)
  const candBag = new Set<string>([
    ...tokenize(candidate.notes),
    ...tokenize(candidate.currentRole),
    ...tokenize(candidate.currentCompany),
  ])
  let overlap = 0
  for (const tok of candBag) if (jdSet.has(tok)) overlap++
  if (jdSet.size > 0) {
    const overlapBonus = Math.min(25, overlap * 3)
    if (overlapBonus > 0) {
      score += overlapBonus
      reasons.push(`+${overlapBonus} keyword overlap (${overlap} terms)`)
    }
  }

  // ─── 3. Source quality (max +10) ────────────────────────────────
  const SOURCE_WEIGHTS: Record<string, number> = {
    REFERRAL: 10,
    LINKEDIN: 6,
    CAREERS_PAGE: 5,
    PORTAL: 3,
    WALK_IN: 4,
    OTHER: 2,
  }
  const srcBump = SOURCE_WEIGHTS[(candidate.source ?? '').toUpperCase()] ?? 0
  if (srcBump > 0) {
    score += srcBump
    reasons.push(`+${srcBump} source ${candidate.source}`)
  }

  // ─── 4. Effort signals (max +10) ────────────────────────────────
  // Did they fill in a CV link? Did they actually write a "why this role" note?
  if (candidate.cvUrl && candidate.cvUrl.trim().length > 5) {
    score += 5
    reasons.push('+5 CV link attached')
  }
  if (candidate.notes && candidate.notes.trim().length > 80) {
    score += 5
    reasons.push('+5 wrote a real note')
  } else if (candidate.notes && candidate.notes.trim().length > 20) {
    score += 2
    reasons.push('+2 short note')
  }

  // Cap at 100, floor at 0.
  score = Math.max(0, Math.min(100, Math.round(score)))
  return { score, reason: reasons.join(' · ') }
}

/** Convenience: classify a score into a UX bucket. */
export function scoreBucket(score: number | null | undefined): {
  label: string
  tone: string  // tailwind classes
} {
  if (score == null) return { label: 'Not scored', tone: 'bg-slate-100 text-slate-500 border-slate-200' }
  if (score >= 80) return { label: 'Strong',       tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  if (score >= 60) return { label: 'Worth a call', tone: 'bg-blue-50 text-blue-700 border-blue-200' }
  if (score >= 40) return { label: 'Maybe',        tone: 'bg-amber-50 text-amber-700 border-amber-200' }
  return            { label: 'Low fit',            tone: 'bg-rose-50 text-rose-700 border-rose-200' }
}
