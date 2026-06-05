/**
 * GET /api/careers/[id] — public, unauthenticated, CORS-open.
 *
 *   Returns the full JD content + facts for a POSTED job, so
 *   convertt.co (or any other host) can render the JD with its own
 *   design system instead of iframing our page.
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params
  const job = await prisma.jobRequisition.findUnique({
    where: { id },
    select: {
      id: true, title: true, type: true, vacancies: true,
      jdContent: true, jdStatus: true, status: true,
      jdApprovedAt: true, closingDate: true, postedDate: true,
      departmentId: true,
    },
  })
  if (!job || job.status !== 'OPEN' || job.jdStatus !== 'POSTED') {
    return NextResponse.json({ error: 'Not found or not currently open' }, { status: 404 })
  }
  const dept = job.departmentId
    ? await prisma.department.findUnique({ where: { id: job.departmentId }, select: { name: true } })
    : null

  return NextResponse.json({
    job: {
      id: job.id,
      title: job.title,
      type: job.type,
      vacancies: job.vacancies,
      department: dept?.name ?? null,
      jdContent: job.jdContent,
      postedAt: job.jdApprovedAt ?? job.postedDate,
      closesAt: job.closingDate,
      applyUrl: `/careers/${job.id}`,
    },
  })
}
