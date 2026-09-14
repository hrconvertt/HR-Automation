/**
 * Pulse questions.
 *   GET   the questions — enabled ones for answering, all of them for HR
 *   POST  HR adds a custom question: { driverKey, text } (asked on 0–10)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveTalentAccess, cleanText } from '@/lib/talent'
import { voiceQuestions } from '@/lib/voice-server'
import { DRIVER_KEYS } from '@/lib/voice'

export async function GET(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const all = await voiceQuestions()
  const hr = access.effectiveRole === 'HR_ADMIN'
  return NextResponse.json({ questions: hr ? all : all.filter((q) => q.enabled) })
}

export async function POST(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (access.actualRole !== 'HR_ADMIN' || access.isPreviewMode) {
    return NextResponse.json({ error: 'Only HR edits the survey.' }, { status: 403 })
  }
  const body = (await request.json().catch(() => ({}))) as { driverKey?: string; text?: string }
  const text = cleanText(body.text, 240)
  if (!body.driverKey || !DRIVER_KEYS.includes(body.driverKey) || !text) {
    return NextResponse.json({ error: 'Pick a driver and write the question.' }, { status: 400 })
  }
  const last = await prisma.pulseQuestion.aggregate({ where: { builtIn: false }, _max: { sortOrder: true } })
  const q = await prisma.pulseQuestion.create({
    data: {
      key: `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      driverKey: body.driverKey,
      text,
      scale: 10,
      builtIn: false,
      enabled: true,
      sortOrder: (last._max.sortOrder ?? 0) + 1,
      createdById: access.userId,
    },
    select: { key: true },
  })
  return NextResponse.json({ question: q }, { status: 201 })
}
