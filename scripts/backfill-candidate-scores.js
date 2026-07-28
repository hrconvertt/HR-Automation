/**
 * One-shot: score every Candidate that doesn't have a matchScore yet.
 * Inlines the scoring logic (mirror of src/lib/candidate-scoring.ts).
 */
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

function expectedExperienceFromTitle(title) {
  const t = title.toLowerCase()
  if (t.includes('intern') || t.includes('trainee')) return { min: 0, ideal: 0.5 }
  if (t.includes('junior') || /\bjr\.?\b/.test(t) || t.includes('associate')) return { min: 1, ideal: 1.5 }
  if (t.includes('senior') || /\bsr\.?\b/.test(t)) return { min: 4, ideal: 6 }
  if (t.includes('lead') || t.includes('head') || t.includes('manager') || t.includes('principal') || t.includes('director')) return { min: 6, ideal: 8 }
  return { min: 2, ideal: 4 }
}

const STOP = new Set(['and','the','for','with','you','your','our','have','this','that','from','will','can','has','are','was','were','their','they','them','about','some','any','than','what','over','under','also','must','should','strong','work','years','year','team','role','role.','design','using','plus','high','quality','fast','clear','clean','etc'])

function jdKeywords(jd) {
  if (!jd) return new Set()
  const tokens = new Set()
  jd.toLowerCase().split(/[^a-z0-9+#.]+/).forEach((t) => {
    const trimmed = t.replace(/^[.+#]+|[.+#]+$/g, '')
    if (trimmed.length >= 3 && !STOP.has(trimmed)) tokens.add(trimmed)
  })
  return tokens
}
function tokenize(text) {
  if (!text) return new Set()
  const out = new Set()
  text.toLowerCase().split(/[^a-z0-9+#.]+/).forEach((t) => {
    const trimmed = t.replace(/^[.+#]+|[.+#]+$/g, '')
    if (trimmed.length >= 3) out.add(trimmed)
  })
  return out
}

function scoreCandidate(c, r) {
  const reasons = []
  let score = 30
  const { min, ideal } = expectedExperienceFromTitle(r.title)
  const exp = c.experience
  if (exp == null) reasons.push('no exp listed')
  else if (exp >= ideal) { score += 30; reasons.push(`+30 exp >= ideal ${ideal}y`) }
  else if (exp >= min) {
    const range = Math.max(0.1, ideal - min)
    const partial = Math.round(15 + 15 * ((exp - min) / range))
    score += partial; reasons.push(`+${partial} exp ${exp}y in [${min}-${ideal}]`)
  } else if (exp >= min - 1) { score += 8; reasons.push(`+8 exp ${exp}y slightly under min ${min}y`) }
  else reasons.push(`exp ${exp}y < min ${min}y`)

  const jd = jdKeywords(r.jdContent)
  const bag = new Set([...tokenize(c.notes), ...tokenize(c.currentRole), ...tokenize(c.currentCompany)])
  let overlap = 0
  for (const tok of bag) if (jd.has(tok)) overlap++
  if (jd.size > 0) {
    const bonus = Math.min(25, overlap * 3)
    if (bonus > 0) { score += bonus; reasons.push(`+${bonus} keyword overlap (${overlap})`) }
  }

  const SRC = { REFERRAL: 10, LINKEDIN: 6, CAREERS_PAGE: 5, PORTAL: 3, WALK_IN: 4, OTHER: 2 }
  const srcBump = SRC[(c.source || '').toUpperCase()] || 0
  if (srcBump > 0) { score += srcBump; reasons.push(`+${srcBump} src ${c.source}`) }

  if (c.cvUrl && c.cvUrl.trim().length > 5) { score += 5; reasons.push('+5 cv') }
  if (c.notes && c.notes.trim().length > 80) { score += 5; reasons.push('+5 real note') }
  else if (c.notes && c.notes.trim().length > 20) { score += 2; reasons.push('+2 short note') }

  score = Math.max(0, Math.min(100, Math.round(score)))
  return { score, reason: reasons.join(' · ') }
}

async function main() {
  const cands = await p.candidate.findMany({
    include: { requisition: { select: { title: true, type: true, jdContent: true } } },
  })
  for (const c of cands) {
    const { score, reason } = scoreCandidate(c, c.requisition)
    await p.candidate.update({ where: { id: c.id }, data: { matchScore: score, scoreReason: reason } })
    console.log(String(c.fullName).padEnd(28), '→', String(score).padStart(3), '·', reason.slice(0, 70))
  }
  console.log('Done.', cands.length, 'candidates scored.')
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
