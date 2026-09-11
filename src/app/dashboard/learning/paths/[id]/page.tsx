/**
 * One learning path — its courses in order, with Play to take the next one.
 *
 * A private path opens only for the person who made it; anyone else gets a
 * plain "this is private" rather than the courses in it.
 */
import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseLessons } from '@/lib/learning'
import { pathAccess } from '@/lib/learning-paths'
import { PathView } from './path-view'

export default async function LearningPathPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')

  const empId = payload.employeeId ?? null
  const access = await pathAccess(id, empId)
  if (!access.exists) notFound()
  if (!access.canView) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
        <p className="text-sm font-medium text-slate-800">This learning path is private.</p>
        <p className="text-xs text-slate-500 mt-1">Only the person who made it can open it.</p>
      </div>
    )
  }

  const path = await prisma.learningPath.findUnique({
    where: { id },
    include: {
      owner: { select: { fullName: true } },
      items: {
        orderBy: { position: 'asc' },
        include: {
          program: { select: { id: true, title: true, type: true, duration: true, lessons: true } },
        },
      },
    },
  })
  if (!path) notFound()

  // Your own status on each course in it — the newest record wins.
  const records = await prisma.trainingRecord.findMany({
    where: {
      employeeId: empId ?? '__no-employee__',
      programId: { in: path.items.map((i) => i.programId) },
    },
    orderBy: { createdAt: 'desc' },
    select: { programId: true, status: true },
  })
  const statusOf = new Map<string, string>()
  for (const r of records) if (!statusOf.has(r.programId)) statusOf.set(r.programId, r.status)

  return (
    <PathView
      isOwner={access.isOwner}
      path={{
        id: path.id,
        title: path.title,
        description: path.description,
        visibility: path.visibility,
        owner: path.owner.fullName,
        items: path.items.map((i) => ({
          programId: i.program.id,
          title: i.program.title,
          type: i.program.type,
          duration: i.program.duration,
          lessonCount: parseLessons(i.program.lessons).length,
          status: statusOf.get(i.program.id) ?? null,
        })),
      }}
    />
  )
}
