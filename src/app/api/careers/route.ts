/**
 * GET /api/careers — public, unauthenticated.
 *
 *   Returns only POSTED jobs (jdStatus='POSTED' AND status='OPEN').
 *   Used by the public /careers page so the world can see what we're hiring.
 *   Excludes anything in DRAFT / PAUSED / CLOSED / FILLED / REJECTED.
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const jobs = await prisma.jobRequisition.findMany({
    where: { jdStatus: 'POSTED', status: 'OPEN' },
    select: {
      id: true,
      title: true,
      type: true,
      vacancies: true,
      jdGeneratedAt: true,
      jdApprovedAt: true,
      postedDate: true,
      departmentId: true,
    },
    orderBy: { jdApprovedAt: 'desc' },
  })

  // Resolve dept names in one round-trip.
  const deptIds = Array.from(new Set(jobs.map((j) => j.departmentId).filter(Boolean) as string[]))
  const depts = deptIds.length
    ? await prisma.department.findMany({ where: { id: { in: deptIds } }, select: { id: true, name: true } })
    : []
  const deptName = new Map(depts.map((d) => [d.id, d.name]))

  return NextResponse.json({
    jobs: jobs.map((j) => ({
      id: j.id,
      title: j.title,
      type: j.type,
      vacancies: j.vacancies,
      department: j.departmentId ? deptName.get(j.departmentId) ?? null : null,
      postedAt: j.jdApprovedAt ?? j.postedDate,
    })),
  })
}
