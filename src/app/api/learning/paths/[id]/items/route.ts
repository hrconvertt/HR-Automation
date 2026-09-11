/**
 * /api/learning/paths/[id]/items — what is in a path, and in what order.
 *
 *   POST   { programId }       add a course at the end (adding twice is not an error)
 *   DELETE { programId }       take it out
 *   PATCH  { order: string[] } the full list of course ids in their new order
 *
 * Owner only. A reorder must name exactly the courses in the path, once each —
 * anything else is refused rather than half-applied.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pathWriter, ownPath } from '@/lib/learning-paths'

interface RouteParams { params: Promise<{ id: string }> }

async function gate(request: NextRequest, params: RouteParams['params']) {
  const who = await pathWriter(request)
  if ('error' in who) return { error: who.error }
  const { id } = await params
  const refused = await ownPath(id, who.employeeId)
  if (refused) return { error: refused }
  return { pathId: id }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const g = await gate(request, params)
  if ('error' in g) return g.error

  const body = await request.json().catch(() => ({}))
  const programId = typeof body.programId === 'string' ? body.programId : ''
  if (!programId) return NextResponse.json({ error: 'No course given' }, { status: 400 })

  const program = await prisma.trainingProgram.findUnique({ where: { id: programId }, select: { id: true } })
  if (!program) return NextResponse.json({ error: 'That course no longer exists' }, { status: 404 })

  const existing = await prisma.learningPathItem.findUnique({
    where: { pathId_programId: { pathId: g.pathId, programId } },
    select: { id: true },
  })
  if (existing) return NextResponse.json({ ok: true, already: true })

  const last = await prisma.learningPathItem.aggregate({
    where: { pathId: g.pathId }, _max: { position: true },
  })
  await prisma.learningPathItem.create({
    data: { pathId: g.pathId, programId, position: (last._max.position ?? -1) + 1 },
  })
  // Touch the path so it sorts to the top of your list.
  await prisma.learningPath.update({ where: { id: g.pathId }, data: { updatedAt: new Date() } })
  return NextResponse.json({ ok: true, already: false }, { status: 201 })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const g = await gate(request, params)
  if ('error' in g) return g.error

  const body = await request.json().catch(() => ({}))
  const programId = typeof body.programId === 'string' ? body.programId : ''
  if (!programId) return NextResponse.json({ error: 'No course given' }, { status: 400 })

  await prisma.learningPathItem.deleteMany({ where: { pathId: g.pathId, programId } })
  return NextResponse.json({ ok: true })
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const g = await gate(request, params)
  if ('error' in g) return g.error

  const body = await request.json().catch(() => ({}))
  const order: string[] = Array.isArray(body.order) ? body.order.map(String) : []
  const items = await prisma.learningPathItem.findMany({
    where: { pathId: g.pathId }, select: { programId: true },
  })
  const have = new Set(items.map((i) => i.programId))
  const valid = order.length === have.size
    && new Set(order).size === order.length
    && order.every((p) => have.has(p))
  if (!valid) {
    return NextResponse.json({ error: 'That order does not match what is in the path — reload and try again' }, { status: 400 })
  }

  await prisma.$transaction(order.map((programId, position) =>
    prisma.learningPathItem.update({
      where: { pathId_programId: { pathId: g.pathId, programId } },
      data: { position },
    }),
  ))
  return NextResponse.json({ ok: true })
}
