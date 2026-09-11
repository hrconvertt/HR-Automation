/**
 * Team Insights — what a manager needs to grow the people who report to them.
 *
 * Modelled on Workday's Manager Insights Hub: the latest career activity for
 * each report, the check-ins coming up, and per person the counts, the
 * suggested actions and the mentors worth introducing them to.
 *
 * Every suggested action is worked out from a real record — a goal marked at
 * risk, a development item past its date, a check-in that never happened, a
 * skill somebody wants with nothing planned for it. None is invented to fill
 * the page; an empty list means there is nothing to chase.
 */
import { prisma } from '@/lib/prisma'
import { JOB_CHANGE_TYPE_LABEL, type JobChangeType } from '@/lib/job-changes'
import {
  CHECK_IN_GAP_DAYS, GOAL_STALL_DAYS, DEV_STATUS_LABEL, skillLevelLabel, type DevStatus,
} from '@/lib/talent-labels'

const DAY = 86_400_000

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

export function daysSince(at: Date, now: Date): number {
  return Math.floor((startOfDay(now).getTime() - startOfDay(at).getTime()) / DAY)
}

/** "Today" / "3 days ago" / "2 months ago". */
export function ago(at: Date, now: Date): string {
  const d = daysSince(at, now)
  if (d <= 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 30) return `${d} days ago`
  const m = Math.floor(d / 30)
  if (m < 12) return `${m} month${m === 1 ? '' : 's'} ago`
  const y = Math.floor(d / 365)
  return `${y} year${y === 1 ? '' : 's'} ago`
}

function day(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function clip(s: string, n = 80): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

/** Created and last touched within a minute of each other — never edited. */
function untouched(created: Date, updated: Date): boolean {
  return Math.abs(updated.getTime() - created.getTime()) < 60_000
}

// ─── Shapes ──────────────────────────────────────────────────────────────────

export type ActivityKind =
  | 'GOAL' | 'DEVELOPMENT' | 'CHECK_IN' | 'SKILL' | 'INTEREST' | 'JOB_CHANGE' | 'MENTORSHIP'

export interface Activity {
  kind: ActivityKind
  label: string
  detail: string
  at: string
  ago: string
}

export interface TopicSeed {
  title: string
  source: 'GOAL' | 'DEVELOPMENT' | 'INTEREST'
  sourceId: string
}

export type ActionKind =
  | 'GOAL_AT_RISK' | 'CHECK_IN_OVERDUE' | 'DEV_OVERDUE' | 'NO_CHECK_IN' | 'GOAL_STALLED' | 'INTEREST_UNPLANNED'

export interface SuggestedAction {
  id: string
  employeeId: string
  employeeName: string
  kind: ActionKind
  title: string
  detail: string
  /** When set, the action can be added as a topic on the next check-in. */
  topic?: TopicSeed
  /** The date of the scheduled check-in the topic is already on, if any. */
  topicOnCheckIn?: string
  href?: string
  hrefLabel?: string
}

/** Most pressing first. */
const ACTION_RANK: Record<ActionKind, number> = {
  GOAL_AT_RISK: 0,
  CHECK_IN_OVERDUE: 1,
  DEV_OVERDUE: 2,
  NO_CHECK_IN: 3,
  GOAL_STALLED: 4,
  INTEREST_UNPLANNED: 5,
}

export interface CheckInRow {
  id: string
  employeeId: string
  employeeName: string
  scheduledFor: string
  scheduledLabel: string
  status: string
  notes: string | null
  completedAt: string | null
  overdue: boolean
  topics: { id: string; title: string; source: string; done: boolean }[]
}

export interface TeamMember {
  id: string
  fullName: string
  designation: string | null
  department: string | null
  managerName: string | null
}

export interface ReportCard {
  member: TeamMember
  counts: { skills: number; interests: number; development: number; goals: number }
  latest: Activity | null
  nextCheckIn: string | null
  lastCheckIn: string | null
  actions: number
}

// ─── Loading ─────────────────────────────────────────────────────────────────

async function loadTalent(ids: string[]) {
  const [goals, devItems, checkIns, skills, interests, jobChanges, mentorships] = await Promise.all([
    prisma.goal.findMany({
      where: { employeeId: { in: ids } },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true, goalId: true, employeeId: true, description: true, status: true,
        target: true, kpi: true, createdAt: true, updatedAt: true,
      },
    }),
    prisma.developmentItem.findMany({
      where: { employeeId: { in: ids } },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true, employeeId: true, title: true, detail: true, status: true, dueDate: true,
        completedAt: true, createdAt: true, updatedAt: true, skillId: true,
        skill: { select: { name: true } },
      },
    }),
    prisma.checkIn.findMany({
      where: { employeeId: { in: ids } },
      orderBy: { scheduledFor: 'desc' },
      select: {
        id: true, employeeId: true, scheduledFor: true, status: true, notes: true,
        completedAt: true, createdAt: true,
        topics: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, title: true, source: true, sourceId: true, done: true },
        },
      },
    }),
    prisma.employeeSkill.findMany({
      where: { employeeId: { in: ids } },
      orderBy: [{ level: 'desc' }, { skill: { name: 'asc' } }],
      select: { id: true, employeeId: true, level: true, createdAt: true, skill: { select: { id: true, name: true } } },
    }),
    prisma.skillInterest.findMany({
      where: { employeeId: { in: ids } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, employeeId: true, skillId: true, createdAt: true, skill: { select: { id: true, name: true } } },
    }),
    prisma.jobChange.findMany({
      where: { employeeId: { in: ids } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, employeeId: true, changeType: true, status: true, toDesignation: true,
        effectiveDate: true, createdAt: true,
      },
    }),
    prisma.mentorship.findMany({
      where: { OR: [{ menteeId: { in: ids } }, { mentorId: { in: ids } }] },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, menteeId: true, mentorId: true, status: true, message: true, createdAt: true,
        startedAt: true, skillId: true,
        skill: { select: { name: true } },
        mentor: { select: { id: true, fullName: true, designation: true } },
        mentee: { select: { id: true, fullName: true, designation: true } },
      },
    }),
  ])
  return { goals, devItems, checkIns, skills, interests, jobChanges, mentorships }
}

type TalentData = Awaited<ReturnType<typeof loadTalent>>

// ─── Derivations ─────────────────────────────────────────────────────────────

function activitiesFor(id: string, d: TalentData, now: Date): Activity[] {
  const out: Omit<Activity, 'ago'>[] = []
  const at = (x: Date) => x.toISOString()

  for (const g of d.goals) {
    if (g.employeeId !== id) continue
    out.push({
      kind: 'GOAL',
      label: g.status === 'COMPLETED' ? 'Completed goal' : untouched(g.createdAt, g.updatedAt) ? 'Added goal' : 'Updated goal',
      detail: g.description,
      at: at(g.updatedAt),
    })
  }
  for (const x of d.devItems) {
    if (x.employeeId !== id) continue
    out.push({
      kind: 'DEVELOPMENT',
      label: x.completedAt ? 'Completed development item'
        : untouched(x.createdAt, x.updatedAt) ? 'Added development item' : 'Updated development item',
      detail: x.title,
      at: at(x.completedAt ?? x.updatedAt),
    })
  }
  for (const c of d.checkIns) {
    if (c.employeeId !== id) continue
    if (c.status === 'DONE' && c.completedAt) {
      out.push({ kind: 'CHECK_IN', label: 'Held check-in', detail: `For ${day(c.scheduledFor)}`, at: at(c.completedAt) })
    } else if (c.status === 'SCHEDULED') {
      out.push({ kind: 'CHECK_IN', label: 'Created check-in', detail: `For ${day(c.scheduledFor)}`, at: at(c.createdAt) })
    }
  }
  for (const s of d.skills) {
    if (s.employeeId !== id) continue
    out.push({ kind: 'SKILL', label: 'Added skill', detail: `${s.skill.name} · ${skillLevelLabel(s.level)}`, at: at(s.createdAt) })
  }
  for (const i of d.interests) {
    if (i.employeeId !== id) continue
    out.push({ kind: 'INTEREST', label: 'Added skill interest', detail: i.skill.name, at: at(i.createdAt) })
  }
  for (const j of d.jobChanges) {
    if (j.employeeId !== id) continue
    const label = JOB_CHANGE_TYPE_LABEL[j.changeType as JobChangeType] ?? j.changeType
    out.push({
      kind: 'JOB_CHANGE',
      label: `${label} requested`,
      detail: j.toDesignation ? `To ${j.toDesignation}` : `Effective ${day(j.effectiveDate)}`,
      at: at(j.createdAt),
    })
  }
  for (const m of d.mentorships) {
    if (m.menteeId !== id) continue
    out.push({
      kind: 'MENTORSHIP',
      label: m.status === 'ACTIVE' ? 'Mentoring started' : m.status === 'ENDED' ? 'Mentoring ended' : 'Mentor suggested',
      detail: `${m.mentor.fullName}${m.skill ? ` · ${m.skill.name}` : ''}`,
      at: at(m.startedAt ?? m.createdAt),
    })
  }

  return out
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((a) => ({ ...a, ago: ago(new Date(a.at), now) }))
}

function actionsFor(m: { id: string; fullName: string }, d: TalentData, now: Date): SuggestedAction[] {
  const first = m.fullName.split(' ')[0]
  const today = startOfDay(now)
  const base = `/dashboard/team-insights/${m.id}`
  const out: SuggestedAction[] = []

  const scheduled = d.checkIns.filter((c) => c.employeeId === m.id && c.status === 'SCHEDULED')
  const upcoming = scheduled.filter((c) => c.scheduledFor >= today)
  // The topic is "already on a check-in" when any scheduled check-in carries it.
  const onCheckIn = (source: string, sourceId: string): string | undefined => {
    const hit = scheduled.find((c) => c.topics.some((t) => t.source === source && t.sourceId === sourceId))
    return hit ? day(hit.scheduledFor) : undefined
  }

  for (const g of d.goals) {
    if (g.employeeId !== m.id || g.status === 'COMPLETED') continue
    if (g.status === 'AT_RISK') {
      out.push({
        id: `goal-risk-${g.id}`, employeeId: m.id, employeeName: m.fullName, kind: 'GOAL_AT_RISK',
        title: `Check on ${first}'s goal`,
        detail: `Marked at risk: ${g.description}`,
        topic: { title: `Goal at risk: ${clip(g.description)}`, source: 'GOAL', sourceId: g.id },
        topicOnCheckIn: onCheckIn('GOAL', g.id),
      })
    } else {
      const idle = daysSince(g.updatedAt, now)
      if (idle >= GOAL_STALL_DAYS) {
        out.push({
          id: `goal-stall-${g.id}`, employeeId: m.id, employeeName: m.fullName, kind: 'GOAL_STALLED',
          title: `${first}'s goal has not moved in ${idle} days`,
          detail: g.description,
          topic: { title: `Goal progress: ${clip(g.description)}`, source: 'GOAL', sourceId: g.id },
          topicOnCheckIn: onCheckIn('GOAL', g.id),
        })
      }
    }
  }

  for (const x of d.devItems) {
    if (x.employeeId !== m.id || x.status === 'COMPLETED' || !x.dueDate || x.dueDate >= today) continue
    out.push({
      id: `dev-due-${x.id}`, employeeId: m.id, employeeName: m.fullName, kind: 'DEV_OVERDUE',
      title: `Development item overdue`,
      detail: `${x.title} — was due ${day(x.dueDate)}`,
      topic: { title: `Overdue: ${clip(x.title)}`, source: 'DEVELOPMENT', sourceId: x.id },
      topicOnCheckIn: onCheckIn('DEVELOPMENT', x.id),
    })
  }

  const overdue = scheduled.filter((c) => c.scheduledFor < today)
  for (const c of overdue) {
    out.push({
      id: `ci-due-${c.id}`, employeeId: m.id, employeeName: m.fullName, kind: 'CHECK_IN_OVERDUE',
      title: `Check-in with ${first} has passed`,
      detail: `Planned for ${day(c.scheduledFor)}. Record how it went, or move it.`,
      href: `${base}?tab=check-ins`, hrefLabel: 'Open check-ins',
    })
  }

  if (upcoming.length === 0 && overdue.length === 0) {
    const done = d.checkIns
      .filter((c) => c.employeeId === m.id && c.status === 'DONE' && c.completedAt)
      .map((c) => c.completedAt as Date)
      .sort((a, b) => b.getTime() - a.getTime())[0]
    if (!done) {
      out.push({
        id: `ci-none-${m.id}`, employeeId: m.id, employeeName: m.fullName, kind: 'NO_CHECK_IN',
        title: `No check-in with ${first} yet`,
        detail: 'Nothing on record. A regular one-to-one is where the rest of this gets discussed.',
        href: `${base}?tab=check-ins`, hrefLabel: 'Schedule a check-in',
      })
    } else if (daysSince(done, now) >= CHECK_IN_GAP_DAYS) {
      out.push({
        id: `ci-gap-${m.id}`, employeeId: m.id, employeeName: m.fullName, kind: 'NO_CHECK_IN',
        title: `No check-in with ${first} in ${daysSince(done, now)} days`,
        detail: `The last one was ${day(done)}, and none is scheduled.`,
        href: `${base}?tab=check-ins`, hrefLabel: 'Schedule a check-in',
      })
    }
  }

  for (const i of d.interests) {
    if (i.employeeId !== m.id) continue
    const planned = d.devItems.some((x) => x.employeeId === m.id && x.skillId === i.skillId && x.status !== 'COMPLETED')
    const mentored = d.mentorships.some((x) => x.menteeId === m.id && x.skillId === i.skillId && x.status !== 'ENDED')
    if (planned || mentored) continue
    out.push({
      id: `interest-${i.id}`, employeeId: m.id, employeeName: m.fullName, kind: 'INTEREST_UNPLANNED',
      title: `${first} wants to grow in ${i.skill.name}`,
      detail: 'No development item or mentor for it yet.',
      topic: { title: `Growing in ${i.skill.name}`, source: 'INTEREST', sourceId: i.id },
      topicOnCheckIn: onCheckIn('INTEREST', i.id),
      href: `${base}?tab=development`, hrefLabel: 'Plan development',
    })
  }

  return out
}

function checkInRow(
  c: TalentData['checkIns'][number], name: string, now: Date,
): CheckInRow {
  return {
    id: c.id,
    employeeId: c.employeeId,
    employeeName: name,
    scheduledFor: c.scheduledFor.toISOString(),
    scheduledLabel: day(c.scheduledFor),
    status: c.status,
    notes: c.notes,
    completedAt: c.completedAt?.toISOString() ?? null,
    overdue: c.status === 'SCHEDULED' && c.scheduledFor < startOfDay(now),
    topics: c.topics.map((t) => ({ id: t.id, title: t.title, source: t.source, done: t.done })),
  }
}

function countsFor(id: string, d: TalentData) {
  return {
    skills: d.skills.filter((s) => s.employeeId === id).length,
    interests: d.interests.filter((s) => s.employeeId === id).length,
    development: d.devItems.filter((x) => x.employeeId === id && x.status !== 'COMPLETED').length,
    goals: d.goals.filter((g) => g.employeeId === id && g.status !== 'COMPLETED').length,
  }
}

// ─── The hub ─────────────────────────────────────────────────────────────────

export async function teamInsights(members: TeamMember[], now = new Date()) {
  const ids = members.map((m) => m.id)
  const empty = {
    reports: [] as ReportCard[],
    upcoming: [] as CheckInRow[],
    actions: [] as SuggestedAction[],
    totals: { reports: 0, checkInsThisWeek: 0, overdueCheckIns: 0, goalsAtRisk: 0, openDevelopment: 0, activeMentorships: 0 },
  }
  if (ids.length === 0) return empty

  const d = await loadTalent(ids)
  const nameOf = new Map(members.map((m) => [m.id, m.fullName]))
  const today = startOfDay(now)
  const weekOut = new Date(today.getTime() + 7 * DAY)

  const actions = members
    .flatMap((m) => actionsFor(m, d, now))
    .sort((a, b) => ACTION_RANK[a.kind] - ACTION_RANK[b.kind] || a.employeeName.localeCompare(b.employeeName))

  const reports: ReportCard[] = members.map((m) => {
    const acts = activitiesFor(m.id, d, now)
    const scheduled = d.checkIns
      .filter((c) => c.employeeId === m.id && c.status === 'SCHEDULED' && c.scheduledFor >= today)
      .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())
    const lastDone = d.checkIns
      .filter((c) => c.employeeId === m.id && c.status === 'DONE' && c.completedAt)
      .sort((a, b) => (b.completedAt as Date).getTime() - (a.completedAt as Date).getTime())[0]
    return {
      member: m,
      counts: countsFor(m.id, d),
      latest: acts[0] ?? null,
      nextCheckIn: scheduled[0] ? day(scheduled[0].scheduledFor) : null,
      lastCheckIn: lastDone ? day(lastDone.completedAt as Date) : null,
      actions: actions.filter((a) => a.employeeId === m.id).length,
    }
  })
  // Whoever has something going on first; the quiet ones after, by name.
  reports.sort((a, b) =>
    (b.latest?.at ?? '').localeCompare(a.latest?.at ?? '') || a.member.fullName.localeCompare(b.member.fullName))

  const upcoming = d.checkIns
    .filter((c) => c.status === 'SCHEDULED')
    .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())
    .map((c) => checkInRow(c, nameOf.get(c.employeeId) ?? '—', now))

  return {
    reports,
    upcoming,
    actions,
    totals: {
      reports: members.length,
      checkInsThisWeek: d.checkIns.filter((c) =>
        c.status === 'SCHEDULED' && c.scheduledFor >= today && c.scheduledFor < weekOut).length,
      overdueCheckIns: upcoming.filter((c) => c.overdue).length,
      goalsAtRisk: d.goals.filter((g) => g.status === 'AT_RISK').length,
      openDevelopment: d.devItems.filter((x) => x.status !== 'COMPLETED').length,
      activeMentorships: d.mentorships.filter((x) => ids.includes(x.menteeId) && x.status === 'ACTIVE').length,
    },
  }
}

export type TeamInsights = Awaited<ReturnType<typeof teamInsights>>

// ─── One report ──────────────────────────────────────────────────────────────

export interface MentorSuggestion {
  id: string
  fullName: string
  designation: string | null
  department: string | null
  yearsInCompany: number
  /** The report's wanted skills this person holds at Strong or above. */
  matched: { skillId: string; name: string; level: number }[]
  /** Their strongest skills, for the "Knows about" line. */
  knowsAbout: string[]
  moreCount: number
}

async function mentorSuggestions(
  employeeId: string, interestSkillIds: string[], openMentorIds: Set<string>, now: Date,
): Promise<MentorSuggestion[]> {
  if (interestSkillIds.length === 0) return []
  const holders = await prisma.employeeSkill.findMany({
    where: {
      skillId: { in: interestSkillIds },
      level: { gte: 3 },
      employeeId: { not: employeeId },
      employee: { status: 'ACTIVE', deletedAt: null },
    },
    select: {
      level: true,
      skill: { select: { id: true, name: true } },
      employee: {
        select: {
          id: true, fullName: true, designation: true, joiningDate: true,
          department: { select: { name: true } },
        },
      },
    },
  })

  const byMentor = new Map<string, MentorSuggestion>()
  for (const h of holders) {
    if (openMentorIds.has(h.employee.id)) continue
    const s = byMentor.get(h.employee.id) ?? {
      id: h.employee.id,
      fullName: h.employee.fullName,
      designation: h.employee.designation,
      department: h.employee.department?.name ?? null,
      yearsInCompany: Math.max(0, Math.floor((now.getTime() - h.employee.joiningDate.getTime()) / (365.25 * DAY))),
      matched: [],
      knowsAbout: [],
      moreCount: 0,
    }
    s.matched.push({ skillId: h.skill.id, name: h.skill.name, level: h.level })
    byMentor.set(h.employee.id, s)
  }
  if (byMentor.size === 0) return []

  const strong = await prisma.employeeSkill.findMany({
    where: { employeeId: { in: [...byMentor.keys()] }, level: { gte: 3 } },
    orderBy: [{ level: 'desc' }, { skill: { name: 'asc' } }],
    select: { employeeId: true, skill: { select: { name: true } } },
  })
  for (const s of byMentor.values()) {
    const names = strong.filter((x) => x.employeeId === s.id).map((x) => x.skill.name)
    s.knowsAbout = names.slice(0, 3)
    s.moreCount = Math.max(0, names.length - 3)
  }

  return [...byMentor.values()]
    .sort((a, b) =>
      b.matched.length - a.matched.length
      || Math.max(...b.matched.map((x) => x.level)) - Math.max(...a.matched.map((x) => x.level))
      || a.fullName.localeCompare(b.fullName))
    .slice(0, 6)
}

export async function talentProfile(
  employeeId: string,
  opts: { cycle?: string; withAssessment?: boolean } = {},
  now = new Date(),
) {
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true, fullName: true, designation: true, employeeCode: true, joiningDate: true,
      status: true, deletedAt: true,
      department: { select: { name: true } },
      reportingManager: { select: { id: true, fullName: true } },
    },
  })
  if (!emp || emp.deletedAt) return null

  const d = await loadTalent([employeeId])
  const openMentorIds = new Set(
    d.mentorships.filter((m) => m.menteeId === employeeId && m.status !== 'ENDED').map((m) => m.mentorId),
  )
  const interests = d.interests.filter((i) => i.employeeId === employeeId)
  const suggestions = await mentorSuggestions(employeeId, interests.map((i) => i.skillId), openMentorIds, now)

  const assessment = opts.withAssessment && opts.cycle
    ? await prisma.talentAssessment.findUnique({
        where: { employeeId_cycleLabel: { employeeId, cycleLabel: opts.cycle } },
        select: { potential: true, performance: true, flightRisk: true, successorFor: true },
      })
    : null

  const openStatuses = ['PENDING_APPROVAL', 'APPROVED']

  return {
    employee: {
      id: emp.id,
      fullName: emp.fullName,
      designation: emp.designation,
      employeeCode: emp.employeeCode,
      department: emp.department?.name ?? null,
      manager: emp.reportingManager,
      joinedLabel: day(emp.joiningDate),
      active: emp.status === 'ACTIVE',
    },
    counts: countsFor(employeeId, d),
    skills: d.skills.filter((s) => s.employeeId === employeeId).map((s) => ({
      id: s.id, skillId: s.skill.id, name: s.skill.name, level: s.level,
    })),
    interests: interests.map((i) => ({ id: i.id, skillId: i.skillId, name: i.skill.name })),
    development: d.devItems
      .filter((x) => x.employeeId === employeeId)
      .map((x) => ({
        id: x.id,
        title: x.title,
        detail: x.detail,
        status: x.status as DevStatus,
        statusLabel: DEV_STATUS_LABEL[x.status as DevStatus] ?? x.status,
        skillId: x.skillId,
        skillName: x.skill?.name ?? null,
        dueDate: x.dueDate ? x.dueDate.toISOString().slice(0, 10) : null,
        dueLabel: x.dueDate ? day(x.dueDate) : null,
        overdue: !!x.dueDate && x.status !== 'COMPLETED' && x.dueDate < startOfDay(now),
      }))
      // Open work first, then what is done.
      .sort((a, b) => Number(a.status === 'COMPLETED') - Number(b.status === 'COMPLETED')),
    goals: d.goals.filter((g) => g.employeeId === employeeId).map((g) => ({
      id: g.id,
      goalId: g.goalId,
      description: g.description,
      status: g.status,
      target: g.target,
      kpi: g.kpi,
      updatedLabel: ago(g.updatedAt, now),
    })),
    checkIns: d.checkIns
      .filter((c) => c.employeeId === employeeId)
      .map((c) => checkInRow(c, emp.fullName, now)),
    mentorships: d.mentorships
      .filter((m) => m.menteeId === employeeId || m.mentorId === employeeId)
      .map((m) => ({
        id: m.id,
        role: m.menteeId === employeeId ? ('MENTEE' as const) : ('MENTOR' as const),
        other: m.menteeId === employeeId ? m.mentor : m.mentee,
        skillName: m.skill?.name ?? null,
        status: m.status,
        message: m.message,
        sinceLabel: day(m.startedAt ?? m.createdAt),
      })),
    jobChanges: d.jobChanges
      .filter((j) => openStatuses.includes(j.status))
      .map((j) => ({
        id: j.id,
        label: JOB_CHANGE_TYPE_LABEL[j.changeType as JobChangeType] ?? j.changeType,
        status: j.status,
        toDesignation: j.toDesignation,
        effectiveLabel: day(j.effectiveDate),
      })),
    activity: activitiesFor(employeeId, d, now).slice(0, 12),
    actions: actionsFor({ id: emp.id, fullName: emp.fullName }, d, now)
      .sort((a, b) => ACTION_RANK[a.kind] - ACTION_RANK[b.kind]),
    mentorSuggestions: suggestions,
    assessment,
  }
}

export type TalentProfile = NonNullable<Awaited<ReturnType<typeof talentProfile>>>
