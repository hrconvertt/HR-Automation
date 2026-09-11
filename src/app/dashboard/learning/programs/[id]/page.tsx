/**
 * A single course: the player for learners, the builder for HR.
 *
 * Everything learner-specific here is the signed-in person's own. A sign-in
 * with no employee record still gets the course; its id matches nothing, so
 * those queries come back empty rather than branching.
 */
import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseLessons, parseQuiz, parseCompleted } from '@/lib/learning'
import { CoursePlayer } from './course-player'
import type { AssignOptions } from './assign-dialog'
import { DEPARTED_STATUSES } from '@/lib/learning-assign'

export default async function ProgramDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')
  const role = cookieStore.get('hr_preview_role')?.value ?? payload.role
  const isHR = role === 'HR_ADMIN'

  const program = await prisma.trainingProgram.findUnique({ where: { id } })
  if (!program) notFound()

  const empId = payload.employeeId ?? null
  const none = '__no-employee__'
  const lessons = parseLessons(program.lessons)
  // Who the course can be sent to. Fetched for HR only — nobody else sees Assign.
  const assign = isHR ? await assignOptions() : null

  const [myRecord, ratingAgg, myRating, save] = await Promise.all([
    prisma.trainingRecord.findFirst({
      where: { programId: id, employeeId: empId ?? none },
      select: { status: true, score: true, completedLessons: true, required: true, dueDate: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.learningRating.aggregate({
      where: { programId: id }, _avg: { stars: true }, _count: { _all: true },
    }),
    prisma.learningRating.findUnique({
      where: { employeeId_programId: { employeeId: empId ?? none, programId: id } },
      select: { stars: true },
    }),
    prisma.learningSave.findUnique({
      where: { employeeId_programId: { employeeId: empId ?? none, programId: id } },
      select: { id: true },
    }),
  ])

  return (
    <CoursePlayer
      isHR={isHR}
      linked={!!empId}
      program={{
        id: program.id,
        title: program.title,
        type: program.type,
        description: program.description,
        provider: program.provider,
        duration: program.duration,
        passingScore: program.passingScore,
        lessons,
        quiz: parseQuiz(program.quiz),
      }}
      record={myRecord
        ? {
          status: myRecord.status,
          score: myRecord.score,
          completed: parseCompleted(myRecord.completedLessons, lessons.length),
          required: myRecord.required,
          dueDate: myRecord.dueDate?.toISOString() ?? null,
        }
        : null}
      rating={{
        mine: myRating?.stars ?? null,
        average: ratingAgg._avg.stars ?? null,
        count: ratingAgg._count._all,
      }}
      saved={!!save}
      assign={assign}
    />
  )
}

/** Current staff and the departments they sit in, with a head-count each. */
async function assignOptions(): Promise<AssignOptions> {
  const staff = await prisma.employee.findMany({
    where: { deletedAt: null, status: { notIn: DEPARTED_STATUSES } },
    select: {
      id: true, fullName: true, employeeCode: true, departmentId: true,
      department: { select: { name: true } },
    },
    orderBy: { fullName: 'asc' },
  })
  const departments = new Map<string, { id: string; name: string; people: number }>()
  for (const s of staff) {
    if (!s.departmentId || !s.department) continue
    const d = departments.get(s.departmentId) ?? { id: s.departmentId, name: s.department.name, people: 0 }
    d.people++
    departments.set(s.departmentId, d)
  }
  return {
    departments: [...departments.values()].sort((a, b) => a.name.localeCompare(b.name)),
    staff: staff.map((s) => ({
      id: s.id, fullName: s.fullName, employeeCode: s.employeeCode, department: s.department?.name ?? null,
    })),
  }
}
