/**
 * Seed Recruiting demo data â€” JobRequisitions + Candidates in various stages.
 *
 *   POST   /api/admin/seed/recruiting   â†’ create demo rows
 *   DELETE /api/admin/seed/recruiting   â†’ remove rows where isDemo=true
 *
 * HR_ADMIN only. Tags everything with `isDemo: true` plus a `[DEMO]`
 * prefix in human-visible titles so it's easy to spot in lists.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

async function gate(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return { error: 'Unauthorized' as const, status: 401 }
  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true },
  })
  if (!me || me.role !== 'HR_ADMIN') return { error: 'Forbidden' as const, status: 403 }
  return { ok: true as const }
}

const SOURCES = ['LINKEDIN', 'CAREERS_PAGE', 'REFERRAL', 'INDEED', 'OTHER'] as const
const STAGE_PLAN: { stage: string; count: number; stuck?: boolean }[] = [
  { stage: 'APPLIED',    count: 12 },
  { stage: 'SCREENING',  count: 8, stuck: true },
  { stage: 'INTERVIEW',  count: 5 },
  { stage: 'OFFER',      count: 3 },
  { stage: 'HIRED',      count: 4 },
  { stage: 'REJECTED',   count: 8 },
]

const REQ_PLAN: { title: string; status: string; type: string }[] = [
  { title: 'Senior Backend Engineer', status: 'OPEN', type: 'FULL_TIME' },
  { title: 'UX Designer',             status: 'OPEN', type: 'FULL_TIME' },
  { title: 'Marketing Manager',       status: 'OPEN', type: 'FULL_TIME' },
  { title: 'HR Generalist',           status: 'FILLED', type: 'FULL_TIME' },
  { title: 'Sales Executive',         status: 'FILLED', type: 'FULL_TIME' },
  { title: 'DevOps Intern',           status: 'PENDING', type: 'INTERNSHIP' },
  { title: 'Content Writer',          status: 'CANCELLED', type: 'CONTRACT' },
]

const FIRST_NAMES = ['Ayesha', 'Bilal', 'Saima', 'Hamza', 'Maryam', 'Usman', 'Zara', 'Omar', 'Hafsa', 'Faisal', 'Iqra', 'Tariq', 'Nida', 'Sami', 'Rabia', 'Kashif']
const LAST_NAMES = ['Khan', 'Ahmed', 'Hussain', 'Malik', 'Iqbal', 'Sheikh', 'Ali', 'Raza', 'Qureshi', 'Butt', 'Awan', 'Siddiqui']

function pick<T>(arr: readonly T[], i: number): T { return arr[i % arr.length] }
function randName(seed: number): string {
  return `${pick(FIRST_NAMES, seed * 7)} ${pick(LAST_NAMES, seed * 13)}`
}
function randScore(stage: string, i: number): number {
  // Stronger for further-along stages; rejected can still be high (talent pool).
  const base = { APPLIED: 55, SCREENING: 65, INTERVIEW: 75, OFFER: 82, HIRED: 88, REJECTED: 50 }[stage] ?? 55
  return Math.min(100, Math.max(20, base + ((i * 11) % 20) - 10))
}

export async function POST(request: NextRequest) {
  const g = await gate(request)
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  // 1) Job Requisitions.
  const reqs = []
  for (const [i, plan] of REQ_PLAN.entries()) {
    const r = await prisma.jobRequisition.create({
      data: {
        title: `[DEMO] ${plan.title}`,
        type: plan.type,
        status: plan.status,
        vacancies: 1 + (i % 2),
        salaryMin: 80_000 + i * 20_000,
        salaryMax: 200_000 + i * 30_000,
        description: 'Demo requisition for testing the Recruiting module.',
        isDemo: true,
        jdStatus: plan.status === 'OPEN' ? 'JD_APPROVED' : null,
      },
    })
    reqs.push(r)
  }

  const openReqs = reqs.filter((r) => r.status === 'OPEN')
  if (openReqs.length === 0) {
    return NextResponse.json({ error: 'No OPEN requisitions to attach candidates to.' }, { status: 500 })
  }

  // 2) Candidates.
  let candidateIdx = 0
  let createdCandidates = 0
  const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000)

  for (const bucket of STAGE_PLAN) {
    for (let i = 0; i < bucket.count; i++) {
      const fullName = `[DEMO] ${randName(candidateIdx)}`
      const score = randScore(bucket.stage, candidateIdx)
      const req = openReqs[candidateIdx % openReqs.length]
      const source = pick(SOURCES, candidateIdx)
      const c = await prisma.candidate.create({
        data: {
          fullName,
          email: `demo.${candidateIdx}.${Date.now()}@example.test`,
          phone: `+92 300 000${String(candidateIdx).padStart(4, '0')}`,
          stage: bucket.stage,
          source,
          matchScore: score,
          scoreReason: `Demo score (${source})`,
          requisitionId: req.id,
          experience: 2 + (candidateIdx % 8),
          inTalentPool: bucket.stage === 'REJECTED' && score >= 60,
          poolAddedAt: bucket.stage === 'REJECTED' && score >= 60 ? new Date() : null,
          poolReason: bucket.stage === 'REJECTED' && score >= 60 ? 'Strong rejection, worth reconsidering' : null,
          isDemo: true,
        },
      })
      // Make "stuck" rows older â€” set updatedAt via a follow-up update.
      if (bucket.stuck && i < 3) {
        await prisma.candidate.update({
          where: { id: c.id },
          data: { updatedAt: eightDaysAgo },
        })
      }
      candidateIdx++
      createdCandidates++
    }
  }

  return NextResponse.json({
    ok: true,
    requisitions: reqs.length,
    candidates: createdCandidates,
  })
}

export async function DELETE(request: NextRequest) {
  const g = await gate(request)
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  // Candidates first (FK to requisitions).
  const { count: cands } = await prisma.candidate.deleteMany({ where: { isDemo: true } })
  const { count: reqs } = await prisma.jobRequisition.deleteMany({ where: { isDemo: true } })

  return NextResponse.json({ ok: true, deleted: { candidates: cands, requisitions: reqs } })
}
