import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

async function requireHR() {
  const c = await cookies()
  const tok = c.get('hr_token')?.value
  const payload = tok ? verifyToken(tok) : null
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const me = await prisma.user.findUnique({ where: { id: payload.userId }, select: { role: true } })
  if (!me || me.role !== 'HR_ADMIN') return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  if (c.get('hr_preview_role')?.value) {
    return { error: NextResponse.json({ error: 'Preview mode cannot modify' }, { status: 403 }) }
  }
  return { ok: true as const }
}

export async function GET() {
  const templates = await prisma.emailTemplate.findMany({ orderBy: { key: 'asc' } })
  return NextResponse.json({ templates })
}

export async function POST(request: NextRequest) {
  const guard = await requireHR()
  if ('error' in guard) return guard.error
  const body = await request.json()
  const key = String(body.key || '').trim()
  if (!key) return NextResponse.json({ error: 'Key required' }, { status: 400 })
  const created = await prisma.emailTemplate.upsert({
    where: { key },
    create: {
      key,
      subject: String(body.subject || ''),
      body: String(body.body || ''),
      description: body.description ? String(body.description) : null,
      variables: body.variables ? String(body.variables) : null,
    },
    update: {
      subject: String(body.subject ?? ''),
      body: String(body.body ?? ''),
      description: body.description !== undefined ? (body.description ? String(body.description) : null) : undefined,
      variables: body.variables !== undefined ? (body.variables ? String(body.variables) : null) : undefined,
    },
  })
  return NextResponse.json({ template: created })
}
