/**
 * /api/learning/me/saves — your own "Saved for later" list.
 *
 *   POST   { programId }  save a course    (saving twice is not an error)
 *   DELETE { programId }  un-save it       (un-saving what isn't saved is not either)
 *
 * Only ever the signed-in person's own list. There is no employeeId in the
 * body to trust — it comes from the session.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

async function whoAndWhat(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const preview = request.cookies.get('hr_preview_role')?.value
  if (hasRole(payload, 'HR_ADMIN') && preview && preview !== 'HR_ADMIN') {
    return { error: NextResponse.json({ error: 'View-only while previewing another role' }, { status: 403 }) }
  }
  if (!payload.employeeId) {
    return { error: NextResponse.json({ error: 'Your account is not linked to an employee record.' }, { status: 400 }) }
  }

  const body = await request.json().catch(() => ({}))
  const programId = typeof body.programId === 'string' ? body.programId : ''
  if (!programId) return { error: NextResponse.json({ error: 'No course given' }, { status: 400 }) }

  return { employeeId: payload.employeeId, programId }
}

export async function POST(request: NextRequest) {
  const r = await whoAndWhat(request)
  if ('error' in r) return r.error

  const program = await prisma.trainingProgram.findUnique({ where: { id: r.programId }, select: { id: true } })
  if (!program) return NextResponse.json({ error: 'That course no longer exists' }, { status: 404 })

  await prisma.learningSave.upsert({
    where: { employeeId_programId: { employeeId: r.employeeId, programId: r.programId } },
    update: {},
    create: { employeeId: r.employeeId, programId: r.programId },
  })
  return NextResponse.json({ ok: true, saved: true })
}

export async function DELETE(request: NextRequest) {
  const r = await whoAndWhat(request)
  if ('error' in r) return r.error

  await prisma.learningSave.deleteMany({
    where: { employeeId: r.employeeId, programId: r.programId },
  })
  return NextResponse.json({ ok: true, saved: false })
}
