/**
 * Job profiles — what each role asks for, in skills.
 *
 * A role's profile is what HR defined for it (RoleSkill). Where HR has not
 * defined one, it can be derived from what the people currently in the role
 * hold at Strong or above — good enough to suggest "next moves" in a career
 * path, but never used to grade those same people against themselves: the
 * skill-gap report only counts defined profiles.
 */
import { prisma } from '@/lib/prisma'

export interface RoleProfile {
  title: string
  source: 'DEFINED' | 'DERIVED'
  /** Active people who hold this title now. */
  holders: number
  skills: { id?: string; skillId: string; name: string; level: number }[]
}

export function roleKey(title: string): string {
  return title.trim().toLowerCase()
}

export async function roleProfiles(opts: { derive?: boolean } = {}): Promise<Map<string, RoleProfile>> {
  const [defined, people] = await Promise.all([
    prisma.roleSkill.findMany({
      orderBy: [{ roleTitle: 'asc' }, { level: 'desc' }],
      select: { id: true, roleTitle: true, level: true, skill: { select: { id: true, name: true } } },
    }),
    prisma.employee.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      select: {
        designation: true,
        skills: { where: { level: { gte: 3 } }, select: { level: true, skill: { select: { id: true, name: true } } } },
      },
    }),
  ])

  const map = new Map<string, RoleProfile>()
  for (const r of defined) {
    const k = roleKey(r.roleTitle)
    const p = map.get(k) ?? { title: r.roleTitle, source: 'DEFINED' as const, holders: 0, skills: [] }
    p.skills.push({ id: r.id, skillId: r.skill.id, name: r.skill.name, level: r.level })
    map.set(k, p)
  }

  const byTitle = new Map<string, typeof people>()
  for (const e of people) {
    if (!e.designation) continue
    const k = roleKey(e.designation)
    byTitle.set(k, [...(byTitle.get(k) ?? []), e])
  }

  for (const [k, list] of byTitle) {
    const existing = map.get(k)
    if (existing) { existing.holders = list.length; continue }
    if (!opts.derive) {
      map.set(k, { title: list[0].designation, source: 'DERIVED', holders: list.length, skills: [] })
      continue
    }
    const agg = new Map<string, { name: string; levels: number[] }>()
    for (const e of list) {
      for (const s of e.skills) {
        const a = agg.get(s.skill.id) ?? { name: s.skill.name, levels: [] }
        a.levels.push(s.level)
        agg.set(s.skill.id, a)
      }
    }
    map.set(k, {
      title: list[0].designation,
      source: 'DERIVED',
      holders: list.length,
      skills: [...agg.entries()].map(([skillId, a]) => ({
        skillId,
        name: a.name,
        level: Math.round(a.levels.reduce((x, y) => x + y, 0) / a.levels.length),
      })),
    })
  }
  return map
}

/**
 * How much of a profile somebody holds, 0–100. Each requirement scores the
 * fraction of its required depth the person holds, capped at one, so being
 * "Working" where "Strong" is asked counts two-thirds rather than nothing.
 * Null when the profile asks for nothing.
 */
export function matchPercent(held: Map<string, number>, reqs: { skillId: string; level: number }[]): number | null {
  if (reqs.length === 0) return null
  const sum = reqs.reduce((s, r) => s + Math.min(1, (held.get(r.skillId) ?? 0) / Math.max(1, r.level)), 0)
  return Math.round((sum / reqs.length) * 100)
}

/** Open requisitions by role title — "N current openings for this role". */
export async function openingsByRole(): Promise<Map<string, number>> {
  const reqs = await prisma.jobRequisition.findMany({
    where: { status: 'OPEN' },
    select: { title: true, vacancies: true },
  })
  const map = new Map<string, number>()
  for (const r of reqs) map.set(roleKey(r.title), (map.get(roleKey(r.title)) ?? 0) + Math.max(1, r.vacancies))
  return map
}
