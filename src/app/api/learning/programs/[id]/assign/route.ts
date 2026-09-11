/**
 * POST /api/learning/programs/[id]/assign — send a course as required learning.
 *
 *   body: {
 *     audience: 'ALL' | 'DEPARTMENT' | 'EMPLOYEES',
 *     departmentId?: string,      when audience is DEPARTMENT
 *     employeeIds?: string[],     when audience is EMPLOYEES
 *     dueDays: number,            1-365
 *     note?: string               added to the notification
 *   }
 *
 * HR only. People who have left are never included, and people who have
 * already completed the course are left alone and counted in the reply.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { AUDIENCES, assignRequired, type Audience } from '@/lib/learning-assign'

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteParams) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'HR only' }, { status: 403 })
  const preview = request.cookies.get('hr_preview_role')?.value
  if (preview && preview !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to assign learning' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const audience = String(body.audience ?? '') as Audience
  if (!(AUDIENCES as readonly string[]).includes(audience)) {
    return NextResponse.json({ error: 'Pick who it goes to' }, { status: 400 })
  }
  const departmentId = typeof body.departmentId === 'string' && body.departmentId ? body.departmentId : null
  const employeeIds: string[] = Array.isArray(body.employeeIds) ? body.employeeIds.map(String).filter(Boolean) : []
  if (audience === 'DEPARTMENT' && !departmentId) {
    return NextResponse.json({ error: 'Pick a department' }, { status: 400 })
  }
  if (audience === 'EMPLOYEES' && employeeIds.length === 0) {
    return NextResponse.json({ error: 'Pick at least one person' }, { status: 400 })
  }

  const dueDays = Number(body.dueDays)
  if (!Number.isInteger(dueDays) || dueDays < 1 || dueDays > 365) {
    return NextResponse.json({ error: 'The deadline is 1 to 365 days away' }, { status: 400 })
  }
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null

  const program = await prisma.trainingProgram.findUnique({ where: { id }, select: { id: true, title: true } })
  if (!program) return NextResponse.json({ error: 'That course no longer exists' }, { status: 404 })

  const result = await assignRequired({
    programId: program.id,
    programTitle: program.title,
    audience,
    departmentId,
    employeeIds,
    dueDays,
    note,
    assignedByUserId: payload.userId,
  })

  if (result.audienceSize === 0) {
    return NextResponse.json({ error: 'Nobody current is in that audience' }, { status: 400 })
  }
  return NextResponse.json({ ok: true, ...result })
}
