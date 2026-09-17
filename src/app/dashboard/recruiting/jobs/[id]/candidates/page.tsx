import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { parseScreening, parseScreeningColumns, trackerValues } from '@/lib/candidate-tracker'
import { resolveViewer } from '../../_lib/load'
import { NoAccess } from '../../_components/no-access'
import { CandidatesView, type ViewCandidate } from './candidates-view'

/**
 * One job's candidates, stage by stage — Workable's candidate view.
 *
 * The same records as the Requisition Workspace sheet: the sheet is every
 * detail in columns, this is one person at a time moving through the stages.
 * CVs dropped anywhere on the page are read into both.
 */
export default async function JobCandidatesPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ stage?: string; c?: string }>
}) {
  const { id } = await params
  const { stage, c } = await searchParams
  const viewer = await resolveViewer()
  if (!viewer.signedIn) redirect('/login')
  if (!viewer.isHR && viewer.role !== 'MANAGER') {
    return <NoAccess message="Only HR and hiring managers can open a job's candidates." />
  }

  const job = await prisma.jobRequisition.findUnique({
    where: { id },
    select: {
      id: true, title: true, status: true, location: true, isRemote: true, departmentId: true,
      screeningColumns: true, jdContent: true,
    },
  })
  if (!job || job.status === 'REJECTED') notFound()

  const [dept, rows] = await Promise.all([
    job.departmentId ? prisma.department.findUnique({ where: { id: job.departmentId }, select: { name: true } }) : null,
    prisma.candidate.findMany({
      where: { requisitionId: id },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true, fullName: true, email: true, phone: true, stage: true, source: true,
        matchScore: true, knockoutStatus: true, knockoutReasons: true, inTalentPool: true,
        currentRole: true, currentCompany: true, location: true, skills: true, answers: true,
        createdAt: true, updatedAt: true, cvUrl: true, notes: true,
        experienceSummary: true, pastCompanies: true, education: true, verdict: true, evaluation: true,
        whyLeaving: true, currentSalary: true, expectedSalary: true, offerResponse: true, noticePeriod: true,
        onsiteWillingness: true, easyCommute: true, communication: true, hrNotes: true, callOutcome: true,
        interviewType: true, interviewDate: true, interviewer: true, leadFeedback: true,
        finalMeeting: true, finalMeetingDate: true, finalMeetingStatus: true, screening: true,
        cvFile: { select: { name: true, mime: true } },
        interviews: { select: { id: true, type: true, scheduledAt: true, result: true }, orderBy: { scheduledAt: 'asc' } },
      },
    }),
  ])

  const json = <T,>(raw: string | null, fallback: T): T => {
    if (!raw) return fallback
    try { return JSON.parse(raw) as T } catch { return fallback }
  }

  const candidates: ViewCandidate[] = rows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    email: r.email.endsWith('@no-email.com') ? null : r.email,
    phone: r.phone,
    stage: r.stage,
    source: r.source,
    matchScore: r.matchScore,
    knockedOut: r.knockoutStatus === 'FAILED',
    knockoutReasons: json<{ reason?: string }[]>(r.knockoutReasons, []).map((x) => x.reason ?? '').filter(Boolean),
    inTalentPool: r.inTalentPool,
    headline: [r.currentRole, r.currentCompany].filter(Boolean).join(' at ') || null,
    location: r.location,
    skills: (() => {
      const v = json<unknown>(r.skills, null)
      return Array.isArray(v) ? v.map(String) : (r.skills ? r.skills.split(',').map((s) => s.trim()).filter(Boolean) : [])
    })(),
    answers: json<{ question?: string; answer?: unknown }[]>(r.answers, [])
      .filter((a) => a && typeof a.question === 'string')
      .map((a) => ({ question: String(a.question), answer: String(a.answer ?? '') })),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    cvUrl: r.cvUrl,
    cv: r.cvFile ? { name: r.cvFile.name, mime: r.cvFile.mime } : null,
    notes: r.notes,
    tracker: trackerValues(r),
    screening: parseScreening(r.screening),
    interviews: r.interviews.map((i) => ({ id: i.id, type: i.type, scheduledAt: i.scheduledAt.toISOString(), result: i.result })),
  }))

  return (
    <CandidatesView
      job={{
        id: job.id,
        title: job.title,
        status: job.status,
        meta: [dept?.name, job.isRemote ? 'Remote' : job.location].filter(Boolean).join(' · '),
        screeningColumns: parseScreeningColumns(job.screeningColumns),
        hasJd: !!job.jdContent,
      }}
      candidates={candidates}
      initialStage={stage ?? null}
      initialCandidateId={c ?? null}
      isHR={viewer.isHR}
    />
  )
}
