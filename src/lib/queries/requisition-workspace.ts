/**
 * One requisition, and everyone in it — the data behind the workspace view.
 *
 * Workday calls this the Job Requisition Workspace Summary View: a rail of
 * requisitions on the left, and on the right the selected one's candidates,
 * counted by stage and listed in a table you can act on.
 *
 * The pipeline board answers "where is everybody"; this answers "what is
 * happening on this role", which is the question actually asked when a
 * manager chases a vacancy. Same records, scoped.
 */
import { prisma } from '@/lib/prisma'
import { STAGES, type StageCount } from './recruiting-dashboard'

/** Statuses that mean the role is real and worth listing. */
const LIVE = ['OPEN', 'PAUSED', 'FILLED', 'CLOSED']

export interface RailItem {
  id: string
  title: string
  status: string
  /** Days since it was posted, or since it was raised if it never was. */
  ageDays: number
  /** Whether ageDays counts from the posting or from the request. */
  ageFrom: 'posted' | 'created'
  candidates: number
}

export interface WorkspaceCandidate {
  id: string
  fullName: string
  stage: string
  knockoutStatus: string
  matchScore: number | null
  appliedAt: string
  cvUrl: string | null
  currentRole: string | null
  currentCompany: string | null
  experience: number | null
  email: string
  phone: string | null
  inTalentPool: boolean
}

export interface WorkspaceDetail {
  id: string
  title: string
  status: string
  type: string
  vacancies: number
  department: string | null
  minExperienceYears: number | null
  salaryMin: number | null
  salaryMax: number | null
  postedDate: Date | null
  closingDate: Date | null
  jdStatus: string | null
  scoreThreshold: number
  requestedBy: string | null
  requestReason: string | null
  requestNote: string | null
  manpowerFormId: string | null
  /** Stage counts for this requisition alone. */
  stages: StageCount[]
  active: WorkspaceCandidate[]
  inactive: WorkspaceCandidate[]
}

export interface RequisitionWorkspace {
  rail: RailItem[]
  selected: WorkspaceDetail | null
}

function days(from: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86400000))
}

export async function requisitionWorkspace(
  requisitionId?: string,
  now = new Date(),
): Promise<RequisitionWorkspace> {
  const reqs = await prisma.jobRequisition.findMany({
    where: { status: { in: LIVE } },
    orderBy: [{ postedDate: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true, title: true, status: true, postedDate: true, createdAt: true,
      _count: { select: { candidates: true } },
    },
  })

  const rail: RailItem[] = reqs.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    ageDays: days(r.postedDate ?? r.createdAt, now),
    ageFrom: r.postedDate ? 'posted' : 'created',
    candidates: r._count.candidates,
  }))

  // Whatever was asked for, if it is on the rail; otherwise the first row, so
  // the panel is never empty next to a rail that is not.
  const wantedId = requisitionId && rail.some((r) => r.id === requisitionId)
    ? requisitionId
    : rail[0]?.id
  if (!wantedId) return { rail, selected: null }

  const full = await prisma.jobRequisition.findUnique({
    where: { id: wantedId },
    include: {
      requestedBy: { select: { fullName: true } },
      manpowerForm: { select: { id: true } },
      candidates: {
        orderBy: [{ matchScore: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true, fullName: true, stage: true, knockoutStatus: true,
          matchScore: true, createdAt: true, cvUrl: true, currentRole: true,
          currentCompany: true, experience: true, email: true, phone: true,
          inTalentPool: true,
        },
      },
    },
  })
  if (!full) return { rail, selected: null }

  const dept = full.departmentId
    ? await prisma.department.findUnique({
      where: { id: full.departmentId }, select: { name: true },
    })
    : null

  const shape = (c: (typeof full.candidates)[number]): WorkspaceCandidate => ({
    id: c.id,
    fullName: c.fullName,
    stage: c.stage,
    knockoutStatus: c.knockoutStatus,
    matchScore: c.matchScore,
    appliedAt: c.createdAt.toISOString(),
    cvUrl: c.cvUrl,
    currentRole: c.currentRole,
    currentCompany: c.currentCompany,
    experience: c.experience,
    email: c.email,
    phone: c.phone,
    inTalentPool: c.inTalentPool,
  })

  // Active / Inactive is Workday's split, and it is the useful one: who is
  // still being considered, and who is on the record but finished with.
  // Rejected and knocked out are both finished with, for different reasons.
  const inactive = full.candidates
    .filter((c) => c.stage === 'REJECTED' || c.knockoutStatus === 'FAILED')
    .map(shape)
  const active = full.candidates
    .filter((c) => c.stage !== 'REJECTED' && c.knockoutStatus !== 'FAILED')
    .map(shape)

  const counts = new Map<string, number>()
  for (const c of full.candidates) {
    counts.set(c.stage, (counts.get(c.stage) ?? 0) + 1)
  }

  return {
    rail,
    selected: {
      id: full.id,
      title: full.title,
      status: full.status,
      type: full.type,
      vacancies: full.vacancies,
      department: dept?.name ?? null,
      minExperienceYears: full.minExperienceYears,
      salaryMin: full.salaryMin,
      salaryMax: full.salaryMax,
      postedDate: full.postedDate,
      closingDate: full.closingDate,
      jdStatus: full.jdStatus,
      scoreThreshold: full.scoreThreshold,
      requestedBy: full.requestedBy?.fullName ?? null,
      requestReason: full.requestReason,
      requestNote: full.requestNote,
      manpowerFormId: full.manpowerForm?.id ?? null,
      stages: STAGES.map((s) => ({
        key: s.key,
        label: s.label,
        count: counts.get(s.key) ?? 0,
      })),
      active,
      inactive,
    },
  }
}
