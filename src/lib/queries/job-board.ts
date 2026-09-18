/**
 * The requisitions board, one card per job — shaped after Workable's jobs list.
 *
 * A card answers "how is this hire going" rather than "is this role set up":
 * how many people sit at each stage, whether the job is on the careers page,
 * and when the last person applied. Counted in four grouped queries for the
 * whole board rather than per card.
 */
import { prisma } from '@/lib/prisma'
import type { GateResult } from '@/lib/requisition-gate'

export interface BoardJob {
  id: string
  title: string
  status: string
  jdStatus: string | null
  type: string
  vacancies: number
  department: string | null
  location: string | null
  isRemote: boolean
  /** Candidates per stage, REJECTED included. */
  counts: Record<string, number>
  total: number
  /** Failed a hard knockout filter — still APPLIED, but not in the pipeline. */
  filteredOut: number
  lastCandidateAt: string | null
  /** Active adverts other than the careers page. */
  paidPosts: number
  authorisedOk: boolean
  authorisedReason: string
  requestedBy: string | null
  jdContent: string | null
  manpowerForm: { id: string; status: string } | null
  // The hiring plan's columns.
  /** REQ101, REQ102… in the order the requisitions were raised, or the internal code. */
  code: string
  requestedById: string | null
  hiringManagers: string[]
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string
  /** When the role should be filled by: the closing date, if one is set. */
  planDate: string | null
  postedDate: string | null
  createdAt: string
}

interface ReqRow {
  id: string
  title: string
  status: string
  jdStatus: string | null
  type: string
  vacancies: number
  departmentId: string | null
  location: string | null
  isRemote: boolean
  jdContent: string | null
  requestedBy: { fullName: string } | null
  manpowerForm: { id: string; status: string } | null
  requestedById: string | null
  internalCode: string | null
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string
  closingDate: Date | null
  postedDate: Date | null
  createdAt: Date
}

export async function jobBoardData(reqs: ReqRow[], authorised: Map<string, GateResult>): Promise<BoardJob[]> {
  const ids = reqs.map((r) => r.id)
  if (ids.length === 0) return []

  const [stages, latest, failed, posts, departments, managers, order] = await Promise.all([
    prisma.candidate.groupBy({
      by: ['requisitionId', 'stage'],
      where: { requisitionId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.candidate.groupBy({
      by: ['requisitionId'],
      where: { requisitionId: { in: ids } },
      _max: { createdAt: true },
    }),
    prisma.candidate.groupBy({
      by: ['requisitionId'],
      where: { requisitionId: { in: ids }, knockoutStatus: 'FAILED' },
      _count: { _all: true },
    }),
    prisma.jobPosting.groupBy({
      by: ['requisitionId'],
      where: { requisitionId: { in: ids }, status: 'ACTIVE', platform: { not: 'CAREERS_PAGE' } },
      _count: { _all: true },
    }),
    prisma.department.findMany({ select: { id: true, name: true } }),
    prisma.requisitionMember.findMany({
      where: { requisitionId: { in: ids }, role: 'HIRING_MANAGER' },
      select: { requisitionId: true, employee: { select: { fullName: true } } },
    }),
    // Every requisition ever raised, oldest first, so REQ numbers never shift.
    prisma.jobRequisition.findMany({ select: { id: true }, orderBy: { createdAt: 'asc' } }),
  ])
  const reqNo = new Map(order.map((r, i) => [r.id, `REQ${101 + i}`]))
  const managersOf = new Map<string, string[]>()
  for (const m of managers) managersOf.set(m.requisitionId, [...(managersOf.get(m.requisitionId) ?? []), m.employee.fullName])

  const deptName = new Map(departments.map((d) => [d.id, d.name]))
  const counts = new Map<string, Record<string, number>>()
  for (const g of stages) {
    const row = counts.get(g.requisitionId) ?? {}
    row[g.stage] = g._count._all
    counts.set(g.requisitionId, row)
  }
  const last = new Map(latest.map((g) => [g.requisitionId, g._max.createdAt]))
  const knocked = new Map(failed.map((g) => [g.requisitionId, g._count._all]))
  const paid = new Map(posts.map((g) => [g.requisitionId, g._count._all]))

  return reqs.map((r) => {
    const c = counts.get(r.id) ?? {}
    const gate = authorised.get(r.id)
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      jdStatus: r.jdStatus,
      type: r.type,
      vacancies: r.vacancies,
      department: r.departmentId ? deptName.get(r.departmentId) ?? null : null,
      location: r.location,
      isRemote: r.isRemote,
      counts: c,
      total: Object.values(c).reduce((a, b) => a + b, 0),
      filteredOut: knocked.get(r.id) ?? 0,
      lastCandidateAt: last.get(r.id)?.toISOString() ?? null,
      paidPosts: paid.get(r.id) ?? 0,
      authorisedOk: gate?.ok ?? true,
      authorisedReason: gate?.reason ?? '',
      requestedBy: r.requestedBy?.fullName ?? null,
      jdContent: r.jdContent,
      manpowerForm: r.manpowerForm,
      code: r.internalCode?.trim() || reqNo.get(r.id) || 'REQ',
      requestedById: r.requestedById,
      hiringManagers: managersOf.get(r.id) ?? [],
      salaryMin: r.salaryMin,
      salaryMax: r.salaryMax,
      salaryCurrency: r.salaryCurrency,
      planDate: r.closingDate?.toISOString() ?? null,
      postedDate: r.postedDate?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }
  })
}
