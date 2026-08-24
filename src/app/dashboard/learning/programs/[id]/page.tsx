/**
 * A single training program: the teaching content first, then the MCQ quiz.
 * HR can build the content; everyone else reads the lessons and takes the quiz.
 */
import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseLessons, parseQuiz } from '@/lib/learning'
import { ProgramDetailClient } from './program-detail-client'

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

  const myRecord = payload.employeeId
    ? await prisma.trainingRecord.findFirst({
        where: { programId: id, employeeId: payload.employeeId },
        select: { status: true, score: true },
        orderBy: { createdAt: 'desc' },
      })
    : null

  return (
    <ProgramDetailClient
      isHR={isHR}
      program={{
        id: program.id,
        title: program.title,
        type: program.type,
        description: program.description,
        provider: program.provider,
        duration: program.duration,
        passingScore: program.passingScore,
        lessons: parseLessons(program.lessons),
        quiz: parseQuiz(program.quiz),
      }}
      myRecord={myRecord}
    />
  )
}
