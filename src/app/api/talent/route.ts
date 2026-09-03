/**
 * GET   /api/talent — the grid for a cycle
 * PATCH /api/talent — set one person's potential, flight risk or note
 *
 * Performance is not accepted from the client. It is read off the appraisal
 * score every time, so the grid cannot drift from the form that produced it —
 * and that drift is the usual reason a talent review stops being believed.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { performanceFromScore, currentCycle } from '@/lib/talent-grid'
import { isFounder } from '@/lib/review-scope'
import { overallAverage, type Ratings } from '@/lib/appraisal-form'

const RISKS = new Set(['LOW', 'MEDIUM', 'HIGH'])

async function gate(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) {
    return { ok: false as const, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (payload.role !== 'HR_ADMIN' && payload.role !== 'EXECUTIVE') {
    return { ok: false as const, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true as const, payload }
}

export async function GET(request: NextRequest) {
  const g = await gate(request)
  if (!g.ok) return g.res
  const cycle = request.nextUrl.searchParams.get('cycle') || currentCycle()

  const employees = await prisma.employee.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { fullName: 'asc' },
    select: {
      id: true, fullName: true, designation: true, joiningDate: true,
      department: { select: { name: true } },
      appraisals: {
        orderBy: { periodTo: 'desc' }, take: 1,
        select: { id: true, ratings: true, periodTo: true, status: true },
      },
      talentAssessments: { where: { cycleLabel: cycle }, take: 1 },
    },
  })

  const rows = employees.filter((e) => !isFounder(e.designation)).map((e) => {
    const appraisal = e.appraisals[0] ?? null
    const raw = appraisal
      ? overallAverage((appraisal.ratings as Ratings | null) ?? {}, 'appraiser')
      : null
    // A form with nothing scored averages zero, which is not "poor" — it is
    // "not assessed", and putting it in the bottom row would be a lie.
    const score = raw != null && raw > 0 ? raw : null
    const a = e.talentAssessments[0] ?? null
    return {
      employeeId: e.id,
      fullName: e.fullName,
      designation: e.designation,
      department: e.department?.name ?? null,
      appraisalId: appraisal?.id ?? null,
      appraisalScore: score,
      performance: performanceFromScore(score),
      potential: a?.potential ?? null,
      flightRisk: a?.flightRisk ?? null,
      successorFor: a?.successorFor ?? null,
      note: a?.note ?? null,
    }
  })

  return NextResponse.json({ cycle, rows })
}

export async function PATCH(request: NextRequest) {
  const g = await gate(request)
  if (!g.ok) return g.res

  let body: {
    employeeId?: string; cycle?: string; potential?: number | null
    flightRisk?: string | null; successorFor?: string | null; note?: string | null
  } = {}
  try { body = await request.json() } catch { /* validated below */ }
  if (!body.employeeId) {
    return NextResponse.json({ error: 'employeeId is required' }, { status: 400 })
  }
  const cycle = body.cycle || currentCycle()

  const emp = await prisma.employee.findUnique({
    where: { id: body.employeeId },
    select: {
      appraisals: { orderBy: { periodTo: 'desc' }, take: 1, select: { ratings: true } },
    },
  })
  if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const raw = emp.appraisals[0]
    ? overallAverage((emp.appraisals[0].ratings as Ratings | null) ?? {}, 'appraiser')
    : null
  const score = raw != null && raw > 0 ? raw : null

  const data = {
    potential: typeof body.potential === 'number' && [1, 2, 3].includes(body.potential)
      ? body.potential : null,
    flightRisk: typeof body.flightRisk === 'string' && RISKS.has(body.flightRisk)
      ? body.flightRisk : null,
    successorFor: typeof body.successorFor === 'string' && body.successorFor.trim()
      ? body.successorFor.trim().slice(0, 200) : null,
    note: typeof body.note === 'string' && body.note.trim()
      ? body.note.trim().slice(0, 2000) : null,
    appraisalScore: score,
    performance: performanceFromScore(score),
    assessedById: g.payload.userId,
  }

  await prisma.talentAssessment.upsert({
    where: { employeeId_cycleLabel: { employeeId: body.employeeId, cycleLabel: cycle } },
    update: data,
    create: { employeeId: body.employeeId, cycleLabel: cycle, ...data },
  })
  return NextResponse.json({ ok: true })
}
