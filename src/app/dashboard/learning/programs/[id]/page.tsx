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
    />
  )
}
