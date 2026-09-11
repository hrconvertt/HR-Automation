/**
 * POST /api/learning/programs/[id]/progress — tick a lesson done, or untick it.
 *
 *   body: { lesson: number, done?: boolean }    done defaults to true
 *
 * Only ever the signed-in learner's own record, created on the first tick if
 * they were never enrolled. Ticking the first lesson moves an enrolment to In
 * progress. Ticking the last completes the course when it has no quiz; with a
 * quiz, passing it is what completes it, exactly as before.
 *
 * Unticking never takes a completion away — a finished course stays finished,
 * and a failed quiz stays failed until it is retaken.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { parseLessons, parseQuiz, parseCompleted } from '@/lib/learning'

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteParams) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const preview = request.cookies.get('hr_preview_role')?.value
  if (hasRole(payload, 'HR_ADMIN') && preview && preview !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'View-only while previewing another role' }, { status: 403 })
  }
  if (!payload.employeeId) {
    return NextResponse.json({ error: 'Your account is not linked to an employee record.' }, { status: 400 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const lesson = Number(body.lesson)
  const done = body.done !== false

  const program = await prisma.trainingProgram.findUnique({
    where: { id }, select: { lessons: true, quiz: true },
  })
  if (!program) return NextResponse.json({ error: 'That course no longer exists' }, { status: 404 })

  const lessons = parseLessons(program.lessons)
  if (!Number.isInteger(lesson) || lesson < 0 || lesson >= lessons.length) {
    return NextResponse.json({ error: 'No such lesson' }, { status: 400 })
  }
  const hasQuiz = parseQuiz(program.quiz).length > 0

  const existing = await prisma.trainingRecord.findFirst({
    where: { programId: id, employeeId: payload.employeeId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, completedLessons: true },
  })

  const set = new Set(parseCompleted(existing?.completedLessons, lessons.length))
  if (done) set.add(lesson)
  else set.delete(lesson)
  const completed = [...set].sort((a, b) => a - b)
  const allDone = completed.length === lessons.length

  let status = existing?.status ?? 'ENROLLED'
  let endDate: Date | undefined
  if (status !== 'COMPLETED') {
    if (allDone && !hasQuiz) {
      status = 'COMPLETED'
      endDate = new Date()
    } else if (completed.length > 0 && status === 'ENROLLED') {
      status = 'IN_PROGRESS'
    }
  }

  if (existing) {
    await prisma.trainingRecord.update({
      where: { id: existing.id },
      data: { completedLessons: completed, status, ...(endDate ? { endDate } : {}) },
    })
  } else {
    await prisma.trainingRecord.create({
      data: {
        employeeId: payload.employeeId,
        programId: id,
        startDate: new Date(),
        status,
        completedLessons: completed,
        ...(endDate ? { endDate } : {}),
      },
    })
  }

  return NextResponse.json({ ok: true, completed, status })
}
