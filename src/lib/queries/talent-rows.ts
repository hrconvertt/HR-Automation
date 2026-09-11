/**
 * The nine-box rows for a cycle — one per active employee, founders excluded.
 *
 * Performance is read off the latest appraisal every time and potential off
 * this cycle's assessment. Shared by the Talent Review grid and Succession
 * Planning, so the two pages cannot put the same person in different boxes.
 */
import { prisma } from '@/lib/prisma'
import { performanceFromScore } from '@/lib/talent-grid'
import { isFounder } from '@/lib/review-scope'
import { overallAverage, type Ratings } from '@/lib/appraisal-form'

export interface TalentRow {
  employeeId: string
  fullName: string
  designation: string | null
  department: string | null
  appraisalId: string | null
  appraisalScore: number | null
  performance: number | null
  potential: number | null
  flightRisk: string | null
  successorFor: string | null
  note: string | null
}

/** A form with nothing scored averages zero, which is "not assessed", not "poor". */
export function appraisalScore(ratings: unknown): number | null {
  const raw = overallAverage((ratings as Ratings | null) ?? {}, 'appraiser')
  return raw > 0 ? raw : null
}

export async function talentRows(cycle: string): Promise<TalentRow[]> {
  const employees = await prisma.employee.findMany({
    where: { status: 'ACTIVE', deletedAt: null },
    orderBy: { fullName: 'asc' },
    select: {
      id: true, fullName: true, designation: true,
      department: { select: { name: true } },
      appraisals: {
        orderBy: { periodTo: 'desc' }, take: 1,
        select: { id: true, ratings: true },
      },
      talentAssessments: { where: { cycleLabel: cycle }, take: 1 },
    },
  })

  return employees.filter((e) => !isFounder(e.designation)).map((e) => {
    const appraisal = e.appraisals[0] ?? null
    const score = appraisal ? appraisalScore(appraisal.ratings) : null
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
}
