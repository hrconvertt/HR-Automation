/**
 * POST /api/learning/programs/[id]/attempt — submit quiz answers.
 *
 * Scores the submitted MCQ answers against the program's quiz and records the
 * result on the signed-in employee's training record (creating it if they were
 * not formally enrolled). Passing (>= passingScore) marks it COMPLETED.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { parseQuiz, scoreQuiz } from '@/lib/learning'

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteParams) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!payload.employeeId) {
    return NextResponse.json({ error: 'Your account is not linked to an employee record.' }, { status: 400 })
  }
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const answers: number[] = Array.isArray(body.answers) ? body.answers.map((a: unknown) => Number(a)) : []

  const program = await prisma.trainingProgram.findUnique({ where: { id } })
  if (!program) return NextResponse.json({ error: 'Program not found' }, { status: 404 })

  const quiz = parseQuiz(program.quiz)
  const result = scoreQuiz(quiz, answers)
  const passed = result.pct >= (program.passingScore ?? 70)
  const status = passed ? 'COMPLETED' : 'FAILED'

  const existing = await prisma.trainingRecord.findFirst({
    where: { programId: id, employeeId: payload.employeeId },
    select: { id: true },
  })
  if (existing) {
    await prisma.trainingRecord.update({
      where: { id: existing.id },
      data: { status, score: result.pct, endDate: passed ? new Date() : null },
    })
  } else {
    await prisma.trainingRecord.create({
      data: {
        employeeId: payload.employeeId,
        programId: id,
        startDate: new Date(),
        endDate: passed ? new Date() : null,
        status,
        score: result.pct,
      },
    })
  }

  return NextResponse.json({
    ok: true,
    correct: result.correct,
    total: result.total,
    pct: result.pct,
    passingScore: program.passingScore ?? 70,
    passed,
    status,
  })
}
