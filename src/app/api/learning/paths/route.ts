/**
 * /api/learning/paths — your learning paths.
 *
 *   GET  ?programId=…   your paths, most recently touched first, each saying
 *                       whether it already holds that course (the dialog
 *                       greys those out rather than letting you add twice)
 *   POST { title, description?, visibility?, programId? }
 *                       make a path, optionally starting with a course
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pathReader, pathWriter, cleanTitle, cleanDescription } from '@/lib/learning-paths'
import { PATH_VISIBILITY } from '@/lib/learning-path-types'

export async function GET(request: NextRequest) {
  const who = await pathReader(request)
  if ('error' in who) return who.error

  const programId = new URL(request.url).searchParams.get('programId')
  const rows = await prisma.learningPath.findMany({
    where: { ownerId: who.employeeId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      visibility: true,
      _count: { select: { items: true } },
      items: { where: { programId: programId ?? '__none__' }, select: { id: true } },
    },
  })

  return NextResponse.json({
    paths: rows.map((p) => ({
      id: p.id,
      title: p.title,
      visibility: p.visibility,
      items: p._count.items,
      contains: p.items.length > 0,
    })),
  })
}

export async function POST(request: NextRequest) {
  const who = await pathWriter(request)
  if ('error' in who) return who.error

  const body = await request.json().catch(() => ({}))
  const title = cleanTitle(body.title)
  if (!title) return NextResponse.json({ error: 'Give the path a name' }, { status: 400 })
  const visibility = (PATH_VISIBILITY as readonly string[]).includes(body.visibility) ? body.visibility : 'PRIVATE'
  const programId = typeof body.programId === 'string' && body.programId ? body.programId : null

  if (programId) {
    const program = await prisma.trainingProgram.findUnique({ where: { id: programId }, select: { id: true } })
    if (!program) return NextResponse.json({ error: 'That course no longer exists' }, { status: 404 })
  }

  const path = await prisma.learningPath.create({
    data: {
      ownerId: who.employeeId,
      title,
      description: cleanDescription(body.description),
      visibility,
      ...(programId ? { items: { create: { programId, position: 0 } } } : {}),
    },
    select: { id: true, title: true },
  })
  return NextResponse.json({ ok: true, path }, { status: 201 })
}
