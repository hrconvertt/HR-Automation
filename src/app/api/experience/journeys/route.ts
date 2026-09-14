/**
 * Journeys studio.
 *   GET   every journey with recipients and completion (HR)
 *   POST  { template?: 'ONBOARDING' | 'NEW_MANAGER', title? } — create one (HR)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cleanText } from '@/lib/talent'
import { journeyAdmin, createJourney } from '@/lib/experience-server'

export async function GET(request: NextRequest) {
  const g = await journeyAdmin(request)
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const journeys = await prisma.experienceJourney.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true, title: true, status: true, autoAssign: true, updatedAt: true,
      assignments: { select: { completedAt: true } },
    },
  })
  return NextResponse.json({
    journeys: journeys.map((j) => ({
      id: j.id, title: j.title, status: j.status, autoAssign: j.autoAssign, updatedAt: j.updatedAt,
      recipients: j.assignments.length,
      completed: j.assignments.filter((a) => a.completedAt).length,
    })),
  })
}

export async function POST(request: NextRequest) {
  const g = await journeyAdmin(request)
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const body = (await request.json().catch(() => ({}))) as { template?: string; title?: string }
  const template = body.template === 'ONBOARDING' || body.template === 'NEW_MANAGER' ? body.template : null
  const journey = await createJourney(template, cleanText(body.title, 140), g.access.userId)
  return NextResponse.json({ journey }, { status: 201 })
}
