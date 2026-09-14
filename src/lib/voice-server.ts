/**
 * Employee Voice on the server — which questions are asked, and what the
 * answers add up to.
 *
 * Confidentiality is enforced here, not in the page: any group — the whole
 * company, a manager's team, a department in the heat map — with fewer than
 * MIN_RESPONSES answers returns no scores and no comments at all. Employee
 * ids are read only to filter and group, and nothing built here carries one.
 */
import { prisma } from '@/lib/prisma'
import { PULSE_DRIVERS, MIN_RESPONSES } from '@/lib/pulse'
import { toTen, DRIVERS, accuracyOf } from '@/lib/voice'

export interface VoiceQuestion {
  key: string
  driverKey: string
  text: string
  scale: number
  enabled: boolean
  builtIn: boolean
  sortOrder: number
}

/**
 * The six built-in questions, with HR's edits and toggles laid over them,
 * followed by HR's custom questions.
 */
export async function voiceQuestions(): Promise<VoiceQuestion[]> {
  const rows = await prisma.pulseQuestion.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
  const byKey = new Map(rows.map((r) => [r.key, r]))
  const builtIns = PULSE_DRIVERS.map((d, i) => {
    const o = byKey.get(d.key)
    return {
      key: d.key, driverKey: d.key, text: o?.text || d.question, scale: 5,
      enabled: o ? o.enabled : true, builtIn: true, sortOrder: i,
    }
  })
  const custom = rows
    .filter((r) => !r.builtIn)
    .map((r) => ({ key: r.key, driverKey: r.driverKey, text: r.text, scale: r.scale, enabled: r.enabled, builtIn: false, sortOrder: 100 + r.sortOrder }))
  return [...builtIns, ...custom]
}

type Row = { enps: number | null; scores: unknown; comment: string | null }

function mean(vals: number[]): number | null {
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null
}

/** The engagement numbers and driver scores for one set of answers. */
function summarise(rows: Row[], questions: VoiceQuestion[]) {
  const enpsVals = rows.map((r) => r.enps).filter((v): v is number => typeof v === 'number')
  const promoters = enpsVals.filter((v) => v >= 9).length
  const passives = enpsVals.filter((v) => v >= 7 && v <= 8).length
  const detractors = enpsVals.filter((v) => v <= 6).length
  const qByKey = new Map(questions.map((q) => [q.key, q]))

  const answers = new Map<string, number[]>()
  for (const r of rows) {
    const s = (r.scores ?? {}) as Record<string, unknown>
    for (const [k, v] of Object.entries(s)) {
      const q = qByKey.get(k)
      if (!q || typeof v !== 'number') continue
      const valid = q.scale === 10 ? v >= 0 && v <= 10 : v >= 1 && v <= 5
      if (!valid) continue
      answers.set(k, [...(answers.get(k) ?? []), toTen(v, q.scale)])
    }
  }

  const drivers = DRIVERS.map((d) => {
    const qs = questions.filter((q) => q.driverKey === d.key && (q.enabled || (answers.get(q.key)?.length ?? 0) > 0))
    const all = qs.flatMap((q) => answers.get(q.key) ?? [])
    return {
      key: d.key,
      label: d.label,
      blurb: d.blurb,
      score: mean(all),
      responses: all.length,
      subs: qs.map((q) => ({
        key: q.key, text: q.text, builtIn: q.builtIn, enabled: q.enabled,
        score: mean(answers.get(q.key) ?? []), responses: answers.get(q.key)?.length ?? 0,
      })),
    }
  })

  return {
    engagement: {
      average: mean(enpsVals),
      enps: enpsVals.length ? Math.round(((promoters - detractors) / enpsVals.length) * 100) : null,
      answered: enpsVals.length,
      promoters, passives, detractors,
    },
    drivers,
  }
}

export async function voiceRounds() {
  return prisma.pulseRound.findMany({
    orderBy: { opensAt: 'desc' },
    select: { id: true, title: true, status: true, opensAt: true, closesAt: true, _count: { select: { responses: true } } },
  })
}

/**
 * Everything the Insight and Analysis tabs show for a round, for the whole
 * company or — with `employeeIds` — one team. Null scores below the floor.
 */
export async function voiceAnalysis(opts: { roundId?: string | null; employeeIds?: string[] | null }) {
  const [questions, rounds] = await Promise.all([voiceQuestions(), voiceRounds()])
  const round = (opts.roundId ? rounds.find((r) => r.id === opts.roundId) : null)
    ?? rounds.find((r) => r._count.responses > 0) ?? rounds[0] ?? null
  const scope = opts.employeeIds ? { employeeId: { in: opts.employeeIds } } : {}
  const invited = opts.employeeIds ? opts.employeeIds.length : await prisma.employee.count({ where: { status: 'ACTIVE', deletedAt: null } })

  if (!round) {
    return { questions, rounds, round: null, responses: 0, invited, belowFloor: true, accuracy: 'Low' as const, current: null, previous: null, history: [], comments: null }
  }

  // Every round's summary, oldest first, for the score-over-time line and the
  // change since last time. Rounds under the floor are left out entirely.
  const chronological = [...rounds].sort((a, b) => a.opensAt.getTime() - b.opensAt.getTime())
  const history: { roundId: string; title: string; date: string; average: number | null; enps: number | null; responses: number }[] = []
  let current: ReturnType<typeof summarise> | null = null
  let previous: ReturnType<typeof summarise> | null = null
  let currentRows: Row[] = []
  for (const r of chronological) {
    const rows = await prisma.pulseResponse.findMany({ where: { roundId: r.id, ...scope }, select: { enps: true, scores: true, comment: true } })
    if (r.id === round.id) currentRows = rows
    if (rows.length < MIN_RESPONSES) continue
    const s = summarise(rows, questions)
    history.push({ roundId: r.id, title: r.title, date: r.opensAt.toISOString(), average: s.engagement.average, enps: s.engagement.enps, responses: rows.length })
    if (r.id === round.id) current = s
    else if (r.opensAt < round.opensAt) previous = s
  }

  const belowFloor = currentRows.length < MIN_RESPONSES
  return {
    questions,
    rounds,
    round,
    responses: currentRows.length,
    invited,
    belowFloor,
    accuracy: accuracyOf(currentRows.length, invited),
    current: belowFloor ? null : current,
    previous,
    history,
    comments: belowFloor ? null : currentRows.map((r) => r.comment).filter((c): c is string => !!c && c.trim().length > 0),
  }
}

export type VoiceAnalysis = Awaited<ReturnType<typeof voiceAnalysis>>

/**
 * Departments against drivers for a round. A department with fewer than
 * MIN_RESPONSES answers is listed as hidden, with no numbers.
 */
export async function voiceHeatmap(roundId: string) {
  const questions = await voiceQuestions()
  const rows = await prisma.pulseResponse.findMany({
    where: { roundId },
    select: { enps: true, scores: true, comment: true, employeeId: true },
  })
  const people = await prisma.employee.findMany({
    where: { id: { in: rows.map((r) => r.employeeId) } },
    select: { id: true, department: { select: { name: true } } },
  })
  const deptOf = new Map(people.map((p) => [p.id, p.department?.name ?? 'No department']))
  const groups = new Map<string, Row[]>()
  for (const r of rows) {
    const d = deptOf.get(r.employeeId) ?? 'No department'
    groups.set(d, [...(groups.get(d) ?? []), { enps: r.enps, scores: r.scores, comment: null }])
  }
  return [...groups.entries()]
    .map(([name, g]) => {
      if (g.length < MIN_RESPONSES) return { name, responses: g.length, hidden: true as const, engagement: null, drivers: {} as Record<string, number | null> }
      const s = summarise(g, questions)
      return {
        name, responses: g.length, hidden: false as const, engagement: s.engagement.average,
        drivers: Object.fromEntries(s.drivers.map((d) => [d.key, d.score])) as Record<string, number | null>,
      }
    })
    .sort((a, b) => Number(a.hidden) - Number(b.hidden) || b.responses - a.responses)
}

/** A manager's most recent team engagement score, or null below the floor. */
export async function teamEngagement(managerEmployeeId: string) {
  const team = await prisma.employee.findMany({
    where: { reportingManagerId: managerEmployeeId, status: 'ACTIVE', deletedAt: null }, select: { id: true },
  })
  if (team.length < MIN_RESPONSES) return null
  const a = await voiceAnalysis({ employeeIds: team.map((t) => t.id) })
  if (!a.current || !a.round) return null
  return { score: a.current.engagement.average, round: a.round.title, responses: a.responses }
}
