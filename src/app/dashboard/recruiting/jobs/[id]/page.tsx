import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requisitionAuthorised } from '@/lib/requisition-gate'
import { KNOCKOUT_FIELD, parseApplicationForm, parseRounds, type ApplicationFieldKey } from '@/lib/job-post'
import { resolveViewer, toEditorJob } from '../_lib/load'
import { JobPostEditor } from '../_components/job-post-editor'
import { NoAccess } from '../_components/no-access'
import { STEP_KEYS, type StepKey } from '../_components/types'

// Words too common in job titles to say two roles are alike.
const TITLE_STOP = new Set(['and', 'the', 'for', 'with', 'senior', 'junior', 'associate', 'intern', 'lead', 'head', 'executive', 'officer', 'specialist'])

/**
 * One job in the editor. HR opens and edits any job; a manager opens the jobs
 * they raised, and edits one while it is a draft or waiting for HR.
 */
export default async function JobPostPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ step?: string }>
}) {
  const { id } = await params
  const { step } = await searchParams
  const viewer = await resolveViewer()
  if (!viewer.signedIn) redirect('/login')
  if (!viewer.isHR && viewer.role !== 'MANAGER') {
    return <NoAccess message="Only HR and hiring managers can open job posts." />
  }

  const req = await prisma.jobRequisition.findUnique({
    where: { id },
    include: {
      requestedBy: { select: { fullName: true, designation: true } },
      members: {
        include: { employee: { select: { id: true, fullName: true, designation: true } } },
        orderBy: { createdAt: 'asc' },
      },
      knockoutCriteria: { select: { type: true, isHard: true } },
    },
  })
  if (!req || req.status === 'REJECTED') notFound()

  const isRequester = !!viewer.employeeId && req.requestedById === viewer.employeeId
  if (!viewer.isHR && !isRequester) {
    return <NoAccess message="You can open the job posts you raised." />
  }
  const canEdit = viewer.isHR || (isRequester && (req.status === 'DRAFT' || req.status === 'PENDING'))

  const [departments, employees, gate, pool, asked] = await Promise.all([
    prisma.department.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, fullName: true, designation: true },
      orderBy: { fullName: 'asc' },
    }),
    requisitionAuthorised(id),
    prisma.candidate.findMany({
      where: { inTalentPool: true },
      select: { currentRole: true, poolTags: true, requisition: { select: { title: true } } },
    }),
    prisma.config.findUnique({ where: { key: `referrals_asked_${id}` } }),
  ])

  // Pool candidates whose role, tags or earlier application share a word of
  // this job's title — a rough "worth a look", counted, not ranked.
  const words = req.title.toLowerCase().split(/[^a-z0-9+#]+/).filter((w) => w.length >= 3 && !TITLE_STOP.has(w))
  const poolMatches = words.length
    ? pool.filter((c) => {
        const hay = `${c.currentRole ?? ''} ${c.poolTags ?? ''} ${c.requisition.title}`.toLowerCase()
        return words.some((w) => hay.includes(w))
      }).length
    : 0

  const knockoutFields = [...new Set(
    req.knockoutCriteria
      .filter((k) => k.isHard)
      .map((k) => KNOCKOUT_FIELD[k.type])
      .filter((f): f is ApplicationFieldKey => !!f),
  )]

  const stepKey = (STEP_KEYS.includes(step ?? '') ? step : 'job') as StepKey

  return (
    <JobPostEditor
      // A publish or submit changes what the header offers; remount on it.
      key={`${req.id}:${req.status}:${req.jdStatus}`}
      job={toEditorJob(req)}
      step={stepKey}
      isHR={viewer.isHR}
      canEdit={canEdit}
      departments={departments}
      details={{
        form: parseApplicationForm(req.applicationForm),
        knockoutFields,
        members: req.members.map((m) => ({
          id: m.id,
          employeeId: m.employeeId,
          name: m.employee.fullName,
          designation: m.employee.designation,
          role: m.role,
        })),
        requester: req.requestedBy
          ? { id: req.requestedById!, name: req.requestedBy.fullName, designation: req.requestedBy.designation }
          : null,
        employees: employees.map((e) => ({ id: e.id, name: e.fullName, designation: e.designation })),
        rounds: parseRounds(req.interviewRounds),
        gateReason: gate.ok ? null : gate.reason,
        poolMatches,
        referralsAskedAt: asked?.value ?? null,
      }}
    />
  )
}
