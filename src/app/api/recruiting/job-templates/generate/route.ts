/**
 * POST /api/recruiting/job-templates/generate — a job description template for any title.
 *
 * body: { title, department? }. Returns { template: { summary, responsibilities[],
 * requirements[], niceToHave[], benefits[] } } written for Convertt, for the
 * "Relevant job templates" picker to offer line by line. Nothing is saved.
 */
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { resolveJobActor } from '@/lib/job-post-server'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const actor = await resolveJobActor(request)
  if (actor instanceof NextResponse) return actor
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Writing templates with AI is not set up on this deployment.' }, { status: 503 })
  }
  const b = await request.json().catch(() => ({})) as { title?: string; department?: string }
  const title = String(b.title ?? '').trim().slice(0, 120)
  if (title.length < 2) return NextResponse.json({ error: 'Give the job title.' }, { status: 400 })

  const client = new Anthropic()
  const message = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 2500,
    system:
      'You write job description templates for Convertt, a CRO-focused design and development agency in Lahore, Pakistan, '
      + 'working with ecommerce brands, dental practices and weight-loss clinics in the US, UK and UAE. Inclusive, specific, '
      + 'no clichés, no salary figures, no invented perks.',
    messages: [{
      role: 'user',
      content: `Write a job description template for: ${title}${b.department ? ` (department: ${String(b.department).slice(0, 60)})` : ''}.\n`
        + 'Return ONLY JSON: {"summary": string (one paragraph, 80-120 words), "responsibilities": string[] (6-9), '
        + '"requirements": string[] (6-9, the skills, tools and experience it needs), "niceToHave": string[] (3-5), '
        + '"benefits": string[] (4-6, true of a Lahore agency: learning, international clients, team, growth)}',
    }],
  })
  const text = message.content.filter((x): x is Anthropic.TextBlock => x.type === 'text').map((x) => x.text).join('')
  try {
    const o = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as Record<string, unknown>
    const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 12) : [])
    return NextResponse.json({
      template: {
        summary: String(o.summary ?? '').trim(),
        responsibilities: list(o.responsibilities),
        requirements: list(o.requirements),
        niceToHave: list(o.niceToHave),
        benefits: list(o.benefits),
      },
    })
  } catch {
    return NextResponse.json({ error: 'The template came back unreadable. Try again.' }, { status: 502 })
  }
}
