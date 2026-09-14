/**
 * PATCH  /api/pulse/questions/[key] — { enabled?, text? } (HR). Built-in
 *        questions keep their key, so answers already given still count.
 * DELETE /api/pulse/questions/[key] — remove a custom question (HR). Built-in
 *        ones are switched off, never deleted.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveTalentAccess, cleanText } from '@/lib/talent'
import { PULSE_DRIVERS } from '@/lib/pulse'

interface RouteContext {
  params: Promise<{ key: string }>
}

async function gate(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (access.actualRole !== 'HR_ADMIN' || access.isPreviewMode) {
    return { res: NextResponse.json({ error: 'Only HR edits the survey.' }, { status: 403 }) }
  }
  return { access }
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const g = await gate(request)
  if ('res' in g) return g.res
  const { key } = await ctx.params
  const body = (await request.json().catch(() => ({}))) as { enabled?: boolean; text?: string }
  const builtIn = PULSE_DRIVERS.find((d) => d.key === key)
  const existing = await prisma.pulseQuestion.findUnique({ where: { key } })
  if (!builtIn && !existing) return NextResponse.json({ error: 'Question not found' }, { status: 404 })

  const data: { enabled?: boolean; text?: string } = {}
  if (typeof body.enabled === 'boolean') data.enabled = body.enabled
  if (body.text !== undefined) {
    const t = cleanText(body.text, 240)
    if (!t) return NextResponse.json({ error: 'The question cannot be empty.' }, { status: 400 })
    data.text = t
  }

  if (existing) {
    await prisma.pulseQuestion.update({ where: { key }, data })
  } else if (builtIn) {
    await prisma.pulseQuestion.create({
      data: {
        key, driverKey: key, text: data.text ?? builtIn.question, scale: 5, builtIn: true,
        enabled: data.enabled ?? true, sortOrder: PULSE_DRIVERS.indexOf(builtIn), createdById: g.access.userId,
      },
    })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const g = await gate(request)
  if ('res' in g) return g.res
  const { key } = await ctx.params
  const existing = await prisma.pulseQuestion.findUnique({ where: { key }, select: { builtIn: true } })
  if (!existing) return NextResponse.json({ error: 'Question not found' }, { status: 404 })
  if (existing.builtIn) return NextResponse.json({ error: 'Built-in questions are switched off, not deleted.' }, { status: 400 })
  await prisma.pulseQuestion.delete({ where: { key } })
  return NextResponse.json({ ok: true })
}
