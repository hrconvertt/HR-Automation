import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

async function requireHR() {
  const c = await cookies()
  const tok = c.get('hr_token')?.value
  const payload = tok ? await verifyToken(tok) : null
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const me = await prisma.user.findUnique({ where: { id: payload.userId }, select: { role: true } })
  if (!me || me.role !== 'HR_ADMIN') return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  if (c.get('hr_preview_role')?.value) {
    return { error: NextResponse.json({ error: 'Preview mode cannot modify' }, { status: 403 }) }
  }
  return { ok: true as const }
}

export async function GET() {
  const templates = await prisma.emailTemplate.findMany({ orderBy: [{ category: 'asc' }, { key: 'asc' }] })
  return NextResponse.json({ templates })
}

export async function POST(request: NextRequest) {
  const guard = await requireHR()
  if ('error' in guard) return guard.error
  const body = await request.json()
  const key = String(body.key || '').trim()
  if (!key) return NextResponse.json({ error: 'Key required' }, { status: 400 })

  const data: Record<string, unknown> = {
    subject: body.subject !== undefined ? String(body.subject ?? '') : undefined,
    body: body.body !== undefined ? String(body.body ?? '') : undefined,
    description: body.description !== undefined ? (body.description ? String(body.description) : null) : undefined,
    variables: body.variables !== undefined ? (body.variables ? String(body.variables) : null) : undefined,
    active: typeof body.active === 'boolean' ? body.active : undefined,
    manualReview: typeof body.manualReview === 'boolean' ? body.manualReview : undefined,
    condition: body.condition !== undefined ? (body.condition ? String(body.condition) : null) : undefined,
  }
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k]

  const created = await prisma.emailTemplate.upsert({
    where: { key },
    create: {
      key,
      subject: String(body.subject || ''),
      body: String(body.body || ''),
      description: body.description ? String(body.description) : null,
      variables: body.variables ? String(body.variables) : null,
      active: typeof body.active === 'boolean' ? body.active : true,
      manualReview: typeof body.manualReview === 'boolean' ? body.manualReview : false,
      condition: body.condition ? String(body.condition) : null,
      category: body.category ? String(body.category) : null,
      name: body.name ? String(body.name) : null,
      triggerEvent: body.triggerEvent ? String(body.triggerEvent) : null,
    },
    update: data,
  })
  return NextResponse.json({ template: created })
}
