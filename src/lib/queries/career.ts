/**
 * Career — the employee's side of talent: where they could go next, who to
 * meet, which flex teams fit, and what their manager has pointed them to.
 *
 * Modelled on Workday's Career Hub and Career Path Builder. Roles are the job
 * profiles in role-profiles (defined by HR, or derived from what the people
 * in the role hold) plus any open requisition, so "N current openings" is a
 * real count of roles Convertt is hiring for.
 */
import { prisma } from '@/lib/prisma'
import { roleProfiles, roleKey, matchPercent, openingsByRole } from '@/lib/queries/role-profiles'
import { mentorSuggestions } from '@/lib/queries/team-insights'

export type MoveBasis = 'INTERESTS' | 'SKILLS'

export interface Move {
  title: string
  /** How many of the person's interests (or skills) the role uses. */
  matches: number
  of: number
  openings: number
  holders: number
  source: 'DEFINED' | 'DERIVED'
  /** How much of the role's profile they hold today, 0–100. */
  fit: number | null
  /** Skills the role asks for that they do not hold deep enough. */
  missing: { skillId: string; name: string; level: number }[]
}

export async function growthBasis(employeeId: string) {
  const [emp, skills, interests] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true, fullName: true, designation: true, reportingManagerId: true,
        department: { select: { name: true } },
      },
    }),
    prisma.employeeSkill.findMany({
      where: { employeeId },
      orderBy: [{ level: 'desc' }, { skill: { name: 'asc' } }],
      select: { level: true, skill: { select: { id: true, name: true } } },
    }),
    prisma.skillInterest.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
      select: { skill: { select: { id: true, name: true } } },
    }),
  ])
  return {
    employee: emp,
    held: new Map(skills.map((s) => [s.skill.id, s.level])),
    skills: skills.map((s) => ({ id: s.skill.id, name: s.skill.name, level: s.level })),
    interests: interests.map((i) => i.skill),
  }
}

export async function nextMoves(opts: {
  employeeId: string
  from: string
  basis: MoveBasis
  exclude?: string[]
}): Promise<Move[]> {
  const [profiles, openings, basis, openReqs] = await Promise.all([
    roleProfiles({ derive: true }),
    openingsByRole(),
    growthBasis(opts.employeeId),
    prisma.jobRequisition.findMany({ where: { status: 'OPEN' }, select: { title: true } }),
  ])
  for (const r of openReqs) {
    const k = roleKey(r.title)
    if (!profiles.has(k)) profiles.set(k, { title: r.title, source: 'DERIVED', holders: 0, skills: [] })
  }

  const skip = new Set([roleKey(opts.from), ...(opts.exclude ?? []).map(roleKey)])
  const basisIds = opts.basis === 'INTERESTS'
    ? new Set(basis.interests.map((i) => i.id))
    : new Set([...basis.held.keys()])

  return [...profiles.entries()]
    .filter(([k]) => !skip.has(k))
    .map(([k, p]) => {
      const ids = new Set(p.skills.map((s) => s.skillId))
      return {
        title: p.title,
        matches: [...basisIds].filter((id) => ids.has(id)).length,
        of: basisIds.size,
        openings: openings.get(k) ?? 0,
        holders: p.holders,
        source: p.source,
        fit: matchPercent(basis.held, p.skills),
        missing: p.skills
          .filter((s) => (basis.held.get(s.skillId) ?? 0) < s.level)
          .map((s) => ({ skillId: s.skillId, name: s.name, level: s.level })),
      }
    })
    .sort((a, b) =>
      b.matches - a.matches || b.openings - a.openings || (b.fit ?? 0) - (a.fit ?? 0) || a.title.localeCompare(b.title))
}

export interface Connection {
  id: string
  fullName: string
  designation: string | null
  department: string | null
  reason: string
}

/**
 * Colleagues worth knowing: people who want to grow in the same things, or
 * who are strong in something this person wants. Mentors already in place and
 * the person's own manager are left out — they know each other.
 */
export async function connectionsFor(employeeId: string, limit = 6): Promise<Connection[]> {
  const [me, interests] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employeeId }, select: { reportingManagerId: true } }),
    prisma.skillInterest.findMany({ where: { employeeId }, select: { skillId: true, skill: { select: { name: true } } } }),
  ])
  if (interests.length === 0) return []
  const ids = interests.map((i) => i.skillId)
  const nameOf = new Map(interests.map((i) => [i.skillId, i.skill.name]))
  const mentors = await prisma.mentorship.findMany({
    where: { menteeId: employeeId, status: { not: 'ENDED' } }, select: { mentorId: true },
  })
  const skip = new Set([employeeId, me?.reportingManagerId ?? '', ...mentors.map((m) => m.mentorId)])
  const live = { status: 'ACTIVE', deletedAt: null }

  const [sameWant, strongIn] = await Promise.all([
    prisma.skillInterest.findMany({
      where: { skillId: { in: ids }, employee: live },
      select: { skillId: true, employee: { select: { id: true, fullName: true, designation: true, department: { select: { name: true } } } } },
    }),
    prisma.employeeSkill.findMany({
      where: { skillId: { in: ids }, level: { gte: 3 }, employee: live },
      select: { skillId: true, employee: { select: { id: true, fullName: true, designation: true, department: { select: { name: true } } } } },
    }),
  ])

  const found = new Map<string, Connection & { score: number }>()
  const add = (e: { id: string; fullName: string; designation: string | null; department: { name: string } | null }, reason: string, score: number) => {
    if (skip.has(e.id)) return
    const c = found.get(e.id)
    if (c) { c.score += score; return }
    found.set(e.id, { id: e.id, fullName: e.fullName, designation: e.designation, department: e.department?.name ?? null, reason, score })
  }
  for (const s of strongIn) add(s.employee, `Strong in ${nameOf.get(s.skillId)}, which you want to grow in`, 2)
  for (const s of sameWant) add(s.employee, `Also growing in ${nameOf.get(s.skillId)}`, 1)

  return [...found.values()]
    .sort((a, b) => b.score - a.score || a.fullName.localeCompare(b.fullName))
    .slice(0, limit)
    .map((c) => ({ id: c.id, fullName: c.fullName, designation: c.designation, department: c.department, reason: c.reason }))
}

export interface FlexTeamCard {
  id: string
  title: string
  category: string | null
  location: string | null
  workMode: string
  hoursPerWeek: string | null
  status: string
  startDate: string | null
  endDate: string | null
  spots: number | null
  members: number
  interested: number
  host: { id: string; fullName: string } | null
  skills: { id: string; name: string }[]
  matches: number
  myStatus: string | null
}

export async function flexTeamCards(opts: {
  employeeId?: string | null
  onlyOpen?: boolean
  matchFor?: { interests: string[]; held: string[] }
} = {}): Promise<FlexTeamCard[]> {
  const teams = await prisma.flexTeam.findMany({
    where: opts.onlyOpen ? { status: 'OPEN' } : {},
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true, title: true, category: true, location: true, workMode: true, hoursPerWeek: true,
      status: true, startDate: true, endDate: true, spots: true,
      host: { select: { id: true, fullName: true } },
      skills: { select: { skill: { select: { id: true, name: true } } } },
      members: { select: { employeeId: true, status: true } },
    },
  })
  const want = new Set([...(opts.matchFor?.interests ?? []), ...(opts.matchFor?.held ?? [])])
  return teams.map((t) => ({
    id: t.id,
    title: t.title,
    category: t.category,
    location: t.location,
    workMode: t.workMode,
    hoursPerWeek: t.hoursPerWeek,
    status: t.status,
    startDate: t.startDate?.toISOString() ?? null,
    endDate: t.endDate?.toISOString() ?? null,
    spots: t.spots,
    members: t.members.filter((m) => m.status === 'MEMBER').length,
    interested: t.members.filter((m) => m.status === 'INTERESTED').length,
    host: t.host,
    skills: t.skills.map((s) => s.skill),
    matches: t.skills.filter((s) => want.has(s.skill.id)).length,
    myStatus: opts.employeeId ? t.members.find((m) => m.employeeId === opts.employeeId)?.status ?? null : null,
  }))
}

/** Everything the Career Hub shows for one person. */
export async function careerHub(employeeId: string) {
  const basis = await growthBasis(employeeId)
  if (!basis.employee) return null
  const interestIds = basis.interests.map((i) => i.id)

  const [suggestionRows, proposed, activeMentoring, teams, connections, paths] = await Promise.all([
    prisma.careerSuggestion.findMany({
      where: { employeeId, dismissedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, kind: true, refId: true, message: true, createdAt: true,
        suggestedBy: { select: { fullName: true } },
      },
    }),
    prisma.mentorship.findMany({
      where: { menteeId: employeeId, status: 'PROPOSED' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, type: true, message: true, createdAt: true,
        mentor: { select: { id: true, fullName: true, designation: true } },
        skill: { select: { name: true } },
      },
    }),
    prisma.mentorship.findMany({
      where: { OR: [{ menteeId: employeeId }, { mentorId: employeeId }], status: 'ACTIVE' },
      select: {
        id: true, type: true, menteeId: true,
        mentor: { select: { fullName: true } }, mentee: { select: { fullName: true } },
        skill: { select: { name: true } },
      },
    }),
    flexTeamCards({ employeeId, onlyOpen: true, matchFor: { interests: interestIds, held: [...basis.held.keys()] } }),
    connectionsFor(employeeId),
    prisma.careerPath.findMany({
      where: { employeeId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, updatedAt: true, steps: { orderBy: { seq: 'asc' }, select: { roleTitle: true } } },
    }),
  ])

  // Resolve what each suggestion points at.
  const teamIds = suggestionRows.filter((s) => s.kind === 'FLEX_TEAM').map((s) => s.refId)
  const personIds = suggestionRows.filter((s) => s.kind === 'CONNECTION').map((s) => s.refId)
  const [sTeams, sPeople] = await Promise.all([
    teamIds.length ? flexTeamCards({ employeeId, matchFor: { interests: interestIds, held: [...basis.held.keys()] } }) : [],
    personIds.length
      ? prisma.employee.findMany({
          where: { id: { in: personIds } },
          select: { id: true, fullName: true, designation: true, email: true },
        })
      : [],
  ])
  const suggestions = suggestionRows.map((s) => ({
    id: s.id,
    kind: s.kind,
    message: s.message,
    from: s.suggestedBy?.fullName ?? 'HR',
    createdAt: s.createdAt.toISOString(),
    team: s.kind === 'FLEX_TEAM' ? sTeams.find((t) => t.id === s.refId) ?? null : null,
    person: s.kind === 'CONNECTION' ? sPeople.find((p) => p.id === s.refId) ?? null : null,
    role: s.kind === 'ROLE' ? s.refId : null,
  })).filter((s) => s.team || s.person || s.role)

  const mentorIdsTaken = new Set([...proposed.map((m) => m.mentor.id)])
  const mentors = (await mentorSuggestions(employeeId, interestIds, mentorIdsTaken, new Date())).slice(0, 3)

  const moves = basis.employee.designation
    ? (await nextMoves({ employeeId, from: basis.employee.designation, basis: 'INTERESTS' })).slice(0, 3)
    : []

  return {
    employee: basis.employee,
    skills: basis.skills,
    interests: basis.interests,
    suggestions,
    proposedMentors: proposed.map((m) => ({
      id: m.id, type: m.type, message: m.message, mentor: m.mentor, skillName: m.skill?.name ?? null,
    })),
    activeMentoring: activeMentoring.map((m) => ({
      id: m.id, type: m.type,
      role: m.menteeId === employeeId ? 'MENTEE' as const : 'MENTOR' as const,
      other: m.menteeId === employeeId ? m.mentor.fullName : m.mentee.fullName,
      skillName: m.skill?.name ?? null,
    })),
    mentors,
    flexTeams: teams.filter((t) => t.matches > 0 || interestIds.length === 0).slice(0, 6),
    connections,
    moves,
    paths: paths.map((p) => ({ id: p.id, name: p.name, steps: p.steps.map((s) => s.roleTitle) })),
  }
}

export type CareerHub = NonNullable<Awaited<ReturnType<typeof careerHub>>>
