/**
 * POST /api/admin/email-templates/test
 * HR_ADMIN. Sends a test of the given template to the current user, with
 * sample variables filled in. Creates an EmailSend row in DRAFT status
 * (still routes through queue UI for visibility).
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { substituteSquareBracketVars } from '@/lib/email-triggers'

export async function POST(request: NextRequest) {
  const c = await cookies()
  const tok = c.get('hr_token')?.value
  const payload = tok ? await verifyToken(tok) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true, email: true, employee: { select: { id: true, fullName: true, designation: true } } },
  })
  if (!me || me.role !== 'HR_ADMIN') return NextResponse.json({ error: 'HR only' }, { status: 403 })

  const body = await request.json()
  const key = String(body.key || '').trim()
  if (!key) return NextResponse.json({ error: 'Key required' }, { status: 400 })
  const tpl = await prisma.emailTemplate.findUnique({ where: { key } })
  if (!tpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const sampleVars: Record<string, string> = {
    'Candidate Name': 'Test Candidate',
    'Candidate First Name': 'Test',
    'Employee Name': me.employee?.fullName ?? 'Test Employee',
    'Employee First Name': (me.employee?.fullName ?? 'Test').split(' ')[0],
    'First Name': (me.employee?.fullName ?? 'Test').split(' ')[0],
    'Full Name': me.employee?.fullName ?? 'Test Employee',
    'Job Title': 'Software Engineer',
    'Designation': me.employee?.designation ?? 'Tester',
    'Department': 'Engineering',
    'Your Name': 'HR Test',
  }

  const subject = `[TEST] ${substituteSquareBracketVars(tpl.subject, sampleVars)}`
  const renderedBody = substituteSquareBracketVars(tpl.body, sampleVars)

  await prisma.emailSend.create({
    data: {
      templateId: tpl.id,
      toEmployeeId: me.employee?.id ?? null,
      toEmail: me.email,
      subject,
      body: renderedBody,
      status: 'DRAFT',
      dedupeKey: `test:${tpl.id}:${Date.now()}`,
      eventName: 'admin.test',
      createdById: me.id,
    },
  })

  return NextResponse.json({ ok: true })
}
