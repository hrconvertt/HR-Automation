/**
 * POST /api/recruiting/candidates/[id]/draft-email — an email to this candidate, written for them.
 *
 * body: { purpose, note? }. Returns { subject, body } drawn from the job and
 * what the record says about the person, in Convertt's voice and signed by
 * whoever is asking. Nothing is sent: HR reads it, edits it, and sends it from
 * their own mailbox.
 */
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'
import { resolveJobActor } from '@/lib/job-post-server'
import { profileText } from '@/lib/candidate-intake'
import { EMAIL_PURPOSES } from '@/lib/candidate-email'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await resolveJobActor(request)
  if (actor instanceof NextResponse) return actor
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Writing with AI is not set up on this deployment.' }, { status: 503 })
  }
  const { id } = await params
  const body = await request.json().catch(() => ({})) as { purpose?: string; note?: string }
  const purpose = EMAIL_PURPOSES.find((p) => p.key === body.purpose) ?? EMAIL_PURPOSES[EMAIL_PURPOSES.length - 1]
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : ''

  const [c, me] = await Promise.all([
    prisma.candidate.findUnique({
      where: { id },
      include: { requisition: { select: { title: true, location: true, isRemote: true, description: true } } },
    }),
    actor.employeeId
      ? prisma.employee.findUnique({ where: { id: actor.employeeId }, select: { fullName: true, designation: true } })
      : null,
  ])
  if (!c) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })

  const client = new Anthropic()
  const message = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1500,
    system:
      'You write short, warm, professional recruiting emails for Convertt, a CRO design and development agency in Lahore. '
      + 'Personalise from the candidate details — mention something specific and true from them — but never invent facts, '
      + 'dates, salaries or promises. Plain text, no markdown, no placeholders in square brackets.',
    messages: [{
      role: 'user',
      content:
        `Job: ${c.requisition.title}${c.requisition.isRemote ? ' (remote)' : c.requisition.location ? ` (${c.requisition.location})` : ''}\n`
        + `Candidate details:\n${profileText(c as unknown as Record<string, unknown>).slice(0, 6000)}\n\n`
        + `Purpose: ${purpose.brief}\n`
        + (note ? `Note from HR: ${note}\n` : '')
        + `Sign it as: ${me?.fullName ?? 'HR Team'}${me?.designation ? `, ${me.designation}` : ''}, Convertt\n\n`
        + 'Return ONLY JSON: {"subject": string, "body": string}. Address them by first name. Keep the body under 150 words.',
    }],
  })
  const text = message.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  try {
    const out = JSON.parse(text.slice(start, end + 1)) as { subject?: unknown; body?: unknown }
    return NextResponse.json({
      subject: String(out.subject ?? '').slice(0, 200),
      body: String(out.body ?? '').slice(0, 5000),
      to: c.email.endsWith('@no-email.com') ? null : c.email,
    })
  } catch {
    return NextResponse.json({ error: 'The draft came back unreadable. Try again.' }, { status: 502 })
  }
}
