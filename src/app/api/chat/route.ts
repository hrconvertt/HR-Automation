import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are an HR assistant for Convertt Technologies Pvt Ltd, a Pakistan-based technology company. You help employees and HR staff with HR-related questions.

You can help with:
- Leave policies (annual leave, sick leave, casual leave, etc.)
- Attendance and clock-in/out procedures
- Payroll and salary slip questions
- Company policies and code of conduct
- Onboarding procedures
- Performance review process
- Compliance (EOBI, FBR, PSEB)
- HR processes and approvals

Company context:
- Working days: Monday to Friday (some employees also work Saturday/Sunday per their schedule)
- Standard working hours: 8 hours/day
- Overtime is calculated at 2× hourly rate (Pakistan Factories Act)
- EOBI contribution: 1% of basic salary (capped at PKR 470/month)
- Leave types: Annual, Sick, Casual, Maternity/Paternity

Keep responses concise and helpful. If a question is outside HR scope, politely redirect. Do not make up specific employee data — direct users to check their profile or contact HR directly for personal records.`

export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      reply: 'The AI assistant is not configured yet. Please ask HR to add the ANTHROPIC_API_KEY to the server environment.',
    })
  }

  const body = await request.json()
  const { messages } = body as { messages: { role: 'user' | 'assistant'; content: string }[] }

  if (!messages?.length) {
    return NextResponse.json({ error: 'No messages provided' }, { status: 400 })
  }

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages,
    })

    const reply = response.content[0].type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ reply })
  } catch (err) {
    console.error('[POST /api/chat]', err)
    return NextResponse.json({ error: 'AI service unavailable' }, { status: 500 })
  }
}
