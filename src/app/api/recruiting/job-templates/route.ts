/**
 * GET /api/recruiting/job-templates?exclude=<requisitionId>
 *
 * What the job post editor offers while writing:
 *   templates — Convertt's own past job descriptions, newest first, one per
 *               title, to import sections from.
 *   titles    — job titles to suggest as the title is typed: the roles people
 *               hold here today and the ones hired for before.
 *
 * Workable draws on a generic library; Convertt's own wording fits better.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveJobActor } from '@/lib/job-post-server'

export async function GET(request: NextRequest) {
  const actor = await resolveJobActor(request)
  if (actor instanceof NextResponse) return actor
  const exclude = request.nextUrl.searchParams.get('exclude')

  const [reqs, people, departments] = await Promise.all([
    prisma.jobRequisition.findMany({
      where: {
        jdContent: { not: null },
        status: { notIn: ['REJECTED'] },
        ...(exclude ? { id: { not: exclude } } : {}),
      },
      select: { id: true, title: true, departmentId: true, jdContent: true },
      orderBy: { updatedAt: 'desc' },
      take: 80,
    }),
    prisma.employee.findMany({ where: { status: 'ACTIVE' }, select: { designation: true } }),
    prisma.department.findMany({ select: { id: true, name: true } }),
  ])

  const deptName = new Map(departments.map((d) => [d.id, d.name]))
  const seen = new Set<string>()
  const templates = reqs
    .filter((r) => r.jdContent?.trim())
    .filter((r) => {
      const k = r.title.trim().toLowerCase()
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .map((r) => ({
      id: r.id,
      title: r.title,
      department: r.departmentId ? deptName.get(r.departmentId) ?? null : null,
      jdContent: r.jdContent!,
    }))

  const titles = [...new Set(
    [...people.map((p) => p.designation), ...reqs.map((r) => r.title)]
      .map((t) => (t ?? '').trim())
      .filter((t) => t.length > 1),
  )].sort((a, b) => a.localeCompare(b))

  return NextResponse.json({ templates, titles })
}
