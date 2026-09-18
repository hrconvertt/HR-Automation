/**
 * POST /api/recruiting/candidates/actions — act on candidates picked across jobs.
 *
 *   { action: 'copy', candidateIds, requisitionId }
 *       Add them to another job: a new candidate on that job with their
 *       details and CV, at Applied, source RESURFACED. Anyone already on it
 *       (same email) is skipped. The original stays where it was.
 *   { action: 'pool', candidateIds }
 *       Keep them in the talent pool.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveJobActor } from '@/lib/job-post-server'

const COPY_FIELDS = [
  'fullName', 'email', 'phone', 'cnic', 'currentCompany', 'currentRole', 'experience', 'workAuthorization',
  'yearsExperience', 'educationLevel', 'location', 'openToRemote', 'skills', 'languages', 'expectedSalary',
  'noticePeriod', 'experienceSummary', 'pastCompanies', 'education', 'whyLeaving', 'currentSalary',
  'onsiteWillingness', 'easyCommute', 'communication',
] as const

export async function POST(request: NextRequest) {
  const actor = await resolveJobActor(request)
  if (actor instanceof NextResponse) return actor
  const b = await request.json().catch(() => ({})) as { action?: string; candidateIds?: unknown; requisitionId?: string }
  const ids = (Array.isArray(b.candidateIds) ? b.candidateIds : []).filter((x): x is string => typeof x === 'string').slice(0, 500)
  if (!ids.length) return NextResponse.json({ error: 'Pick at least one candidate.' }, { status: 400 })

  if (b.action === 'pool') {
    const r = await prisma.candidate.updateMany({
      where: { id: { in: ids }, inTalentPool: false },
      data: { inTalentPool: true, poolAddedAt: new Date(), poolReason: 'Added from candidate search' },
    })
    return NextResponse.json({ updated: r.count })
  }

  if (b.action !== 'copy') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  const job = b.requisitionId
    ? await prisma.jobRequisition.findUnique({ where: { id: b.requisitionId }, select: { id: true, title: true } })
    : null
  if (!job) return NextResponse.json({ error: 'Choose the job to add them to.' }, { status: 400 })

  const [sources, onJob] = await Promise.all([
    prisma.candidate.findMany({
      where: { id: { in: ids } },
      include: { cvFile: true, requisition: { select: { title: true } } },
    }),
    prisma.candidate.findMany({ where: { requisitionId: job.id }, select: { email: true } }),
  ])
  const have = new Set(onJob.map((c) => c.email.toLowerCase()))
  let added = 0
  let skipped = 0
  for (const s of sources) {
    const key = s.email.toLowerCase()
    if (!key.endsWith('@no-email.com') && have.has(key)) { skipped++; continue }
    have.add(key)
    const data: Record<string, unknown> = {}
    for (const f of COPY_FIELDS) data[f] = (s as Record<string, unknown>)[f]
    const created = await prisma.candidate.create({
      data: {
        ...(data as { fullName: string; email: string }),
        email: key.endsWith('@no-email.com') ? `unknown-${Date.now()}-${added}@no-email.com` : s.email,
        requisitionId: job.id,
        stage: 'APPLIED',
        source: 'RESURFACED',
        notes: `Resurfaced from ${s.requisition.title}`,
        cvUrl: s.cvFile ? null : s.cvUrl,
      },
      select: { id: true },
    })
    if (s.cvFile) {
      await prisma.candidateCvFile.create({
        data: { candidateId: created.id, name: s.cvFile.name, mime: s.cvFile.mime, size: s.cvFile.size, bytes: s.cvFile.bytes },
      })
      await prisma.candidate.update({ where: { id: created.id }, data: { cvUrl: `/api/recruiting/candidates/${created.id}/cv` } })
    }
    added++
  }
  return NextResponse.json({ added, skipped })
}
