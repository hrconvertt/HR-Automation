/**
 * POST /api/recruiting/requisitions/[id]/referrals — ask the team for referrals.
 *
 * Every active employee is notified with the job's careers link, tagged so an
 * application through it is recorded with source REFERRAL. HR only, live jobs
 * only, and once a week per job: a second click the same afternoon would send
 * the whole company the same notification twice.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveJobActor } from '@/lib/job-post-server'

interface RouteParams { params: Promise<{ id: string }> }

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export async function POST(request: NextRequest, { params }: RouteParams) {
  const actor = await resolveJobActor(request)
  if (actor instanceof NextResponse) return actor
  if (!actor.isHR) return NextResponse.json({ error: 'HR only' }, { status: 403 })
  const { id } = await params

  const req = await prisma.jobRequisition.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, jdStatus: true },
  })
  if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (req.status !== 'OPEN' || req.jdStatus !== 'POSTED') {
    return NextResponse.json({ error: 'Publish the job before asking for referrals.' }, { status: 409 })
  }

  const key = `referrals_asked_${id}`
  const asked = await prisma.config.findUnique({ where: { key } })
  const askedAt = asked?.value ? new Date(asked.value) : null
  if (askedAt && !isNaN(askedAt.getTime()) && Date.now() - askedAt.getTime() < WEEK_MS) {
    return NextResponse.json({
      error: `Your team was already asked on ${askedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}. You can ask again a week after that.`,
    }, { status: 409 })
  }

  const employees = await prisma.employee.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  })
  await prisma.notification.createMany({
    data: employees.map((e) => ({
      employeeId: e.id,
      type: 'REFERRAL_REQUEST',
      title: `Know someone for ${req.title}?`,
      message: 'We are hiring. Share the job with anyone who would be good at it — applications through this link are recorded as referrals.',
      link: `/careers/${id}?source=REFERRAL`,
    })),
  })
  const now = new Date().toISOString()
  await prisma.config.upsert({ where: { key }, update: { value: now }, create: { key, value: now } })

  return NextResponse.json({ ok: true, sent: employees.length })
}
