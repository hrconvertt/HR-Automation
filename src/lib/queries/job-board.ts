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
}

export async function jobBoardData(reqs: ReqRow[], authorised: Map<string, GateResult>): Promise<BoardJob[]> {
  const ids = reqs.map((r) => r.id)
  if (ids.length === 0) return []

  const [stages, latest, failed, posts, departments] = await Promise.all([
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
  ])

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
    }
  })
}
