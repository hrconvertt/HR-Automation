/**
 * PATCH  /api/learning/programs/[id] — edit a program.
 * DELETE /api/learning/programs/[id] — remove it and its enrolment records.
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { PROGRAM_TYPES } from '@/lib/learning'

interface RouteParams { params: Promise<{ id: string }> }

async function gateHR(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!hasRole(payload, 'HR_ADMIN')) return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  return { payload }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const data: Record<string, unknown> = {}
  if (body.title !== undefined) {
    const t = String(body.title).trim()
    if (!t) return NextResponse.json({ error: 'A program needs a title' }, { status: 400 })
    data.title = t.slice(0, 200)
  }
  if ((PROGRAM_TYPES as readonly string[]).includes(body.type)) data.type = body.type
  if (body.provider !== undefined) data.provider = body.provider ? String(body.provider).slice(0, 200) : null
  if (body.description !== undefined) data.description = body.description ? String(body.description).slice(0, 4000) : null
  for (const k of ['duration', 'cost'] as const) {
    if (body[k] === undefined) continue
    const n = Number(body[k])
    data[k] = body[k] === '' || body[k] == null || !Number.isFinite(n) || n < 0 ? null : n
  }

  const program = await prisma.trainingProgram.update({ where: { id }, data })
  return NextResponse.json({ ok: true, program })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const { id } = await params
  // Records reference the program; clear them first, then the program.
  await prisma.trainingRecord.deleteMany({ where: { programId: id } })
  await prisma.trainingProgram.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
