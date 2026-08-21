/**
 * POST /api/learning/programs — create a training program.
 * HR only. (The list is read on the page server-side.)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { PROGRAM_TYPES } from '@/lib/learning'

export async function POST(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'HR only' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const title = String(body.title ?? '').trim()
  if (!title) return NextResponse.json({ error: 'A program needs a title' }, { status: 400 })

  const type = (PROGRAM_TYPES as readonly string[]).includes(body.type) ? body.type : 'TECHNICAL'
  const num = (v: unknown) => {
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? n : null
  }

  const program = await prisma.trainingProgram.create({
    data: {
      title: title.slice(0, 200),
      type,
      provider: body.provider ? String(body.provider).slice(0, 200) : null,
      description: body.description ? String(body.description).slice(0, 4000) : null,
      duration: num(body.duration),
      cost: num(body.cost),
    },
    select: { id: true },
  })
  return NextResponse.json({ ok: true, program }, { status: 201 })
}
