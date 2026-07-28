/**
 * Knockout evaluator — Workday-style "gate before score".
 *
 * Runs at application intake (and on manual re-evaluation). For each HARD
 * criterion on the requisition, checks the candidate's submitted data.
 * Soft criteria are recorded but don't block. Returns the list of failures.
 *
 * Criterion types & value formats:
 *   WORK_AUTH      value="PK"                 — candidate.workAuthorization must equal value
 *   LOCATION       value="Lahore,Karachi,Remote-OK"
 *                                             — candidate.location matches one of csv,
 *                                               OR openToRemote && value includes "Remote-OK"
 *   SKILL          value="Shopify Liquid"     — candidate.skills (JSON array) contains, case-insensitive
 *   MIN_YEARS      value="3"                  — candidate.yearsExperience >= value
 *   MIN_EDUCATION  value="BACHELORS"          — candidate education rank >= value rank
 *   LANGUAGE       value="English"            — candidate.languages contains, case-insensitive
 */
import { prisma } from './prisma'

export interface KnockoutFailure {
  type: string
  reason: string
}

export interface KnockoutResult {
  passed: boolean
  failures: KnockoutFailure[]
}

const EDUCATION_RANK: Record<string, number> = {
  HIGH_SCHOOL: 1,
  DIPLOMA: 2,
  BACHELORS: 3,
  MASTERS: 4,
  PHD: 5,
}

function parseJsonArray(s: string | null | undefined): string[] {
  if (!s) return []
  try {
    const parsed = JSON.parse(s)
    return Array.isArray(parsed) ? parsed.map((x) => String(x)) : []
  } catch {
    // Allow comma-separated fallback so HR can paste raw lists.
    return s.split(',').map((t) => t.trim()).filter(Boolean)
  }
}

interface EvaluatableCandidate {
  workAuthorization: string | null
  location: string | null
  openToRemote: boolean
  skills: string | null
  languages: string | null
  yearsExperience: number | null
  experience: number | null
  educationLevel: string | null
}

interface EvaluatableCriterion {
  type: string
  value: string
  isHard: boolean
}

/** Pure evaluator — used by both the DB-loading path and tests. */
export function evaluateCriteria(
  candidate: EvaluatableCandidate,
  criteria: EvaluatableCriterion[],
): KnockoutResult {
  const failures: KnockoutFailure[] = []

  for (const c of criteria) {
    if (!c.isHard) continue
    const v = (c.value ?? '').trim()
    if (!v) continue

    switch (c.type) {
      case 'WORK_AUTH': {
        const have = (candidate.workAuthorization ?? '').toUpperCase().trim()
        const want = v.toUpperCase()
        if (have !== want) {
          failures.push({ type: c.type, reason: `Work authorization required: ${want}${have ? ` (have: ${have})` : ' (none provided)'}` })
        }
        break
      }
      case 'LOCATION': {
        const accepted = v.split(',').map((s) => s.trim()).filter(Boolean)
        const remoteOk = accepted.some((a) => a.toUpperCase() === 'REMOTE-OK')
        const loc = (candidate.location ?? '').trim().toLowerCase()
        const matched = accepted.some((a) => a.toLowerCase() === loc) ||
                        (remoteOk && candidate.openToRemote === true)
        if (!matched) {
          failures.push({
            type: c.type,
            reason: `Location must be one of ${accepted.join(', ')}${candidate.location ? ` (have: ${candidate.location})` : ' (none provided)'}`,
          })
        }
        break
      }
      case 'SKILL': {
        const skillList = parseJsonArray(candidate.skills).map((s) => s.toLowerCase())
        const needle = v.toLowerCase()
        const has = skillList.some((s) => s.includes(needle))
        if (!has) failures.push({ type: c.type, reason: `Missing required skill: ${v}` })
        break
      }
      case 'MIN_YEARS': {
        const required = Number(v)
        const have = candidate.yearsExperience ?? candidate.experience ?? null
        if (!Number.isFinite(required)) break
        if (have == null || have < required) {
          failures.push({ type: c.type, reason: `Min ${required} years experience required${have != null ? ` (have: ${have})` : ' (none provided)'}` })
        }
        break
      }
      case 'MIN_EDUCATION': {
        const required = EDUCATION_RANK[v.toUpperCase()] ?? 0
        const have = EDUCATION_RANK[(candidate.educationLevel ?? '').toUpperCase()] ?? 0
        if (required > 0 && have < required) {
          failures.push({
            type: c.type,
            reason: `Min education ${v}${candidate.educationLevel ? ` (have: ${candidate.educationLevel})` : ' (none provided)'}`,
          })
        }
        break
      }
      case 'LANGUAGE': {
        const langList = parseJsonArray(candidate.languages).map((s) => s.toLowerCase())
        const needle = v.toLowerCase()
        if (!langList.some((l) => l.includes(needle))) {
          failures.push({ type: c.type, reason: `Language required: ${v}` })
        }
        break
      }
      default:
        // Unknown criterion type — skip, don't block.
        break
    }
  }

  return { passed: failures.length === 0, failures }
}

/** Load candidate + criteria from DB and evaluate. */
export async function evaluateKnockouts(candidateId: string): Promise<KnockoutResult> {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: {
      workAuthorization: true,
      location: true,
      openToRemote: true,
      skills: true,
      languages: true,
      yearsExperience: true,
      experience: true,
      educationLevel: true,
      requisitionId: true,
    },
  })
  if (!candidate) return { passed: true, failures: [] }

  const criteria = await prisma.knockoutCriterion.findMany({
    where: { requisitionId: candidate.requisitionId },
    select: { type: true, value: true, isHard: true },
  })

  // No criteria defined → backwards-compatible: pass everyone through.
  if (criteria.length === 0) return { passed: true, failures: [] }

  return evaluateCriteria(candidate, criteria)
}
