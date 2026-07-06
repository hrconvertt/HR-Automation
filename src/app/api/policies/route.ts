import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { parseAudienceRoles, ALLOWED_AUDIENCE_ROLES, DEFAULT_AUDIENCE_ROLES } from '@/lib/policy-access'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isHR = user.role === 'HR_ADMIN'
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const q = searchParams.get('q')?.toLowerCase() ?? ''

  // Non-HR users only see ACTIVE policies in their audience.
  // Legacy "PUBLISHED" rows (pre-workflow) are treated as ACTIVE.
  let where: Record<string, unknown> = {}
  if (!isHR) {
    const audiences = ['ALL']
    if (user.role === 'MANAGER') audiences.push('MANAGERS')
    where = {
      status: { in: ['ACTIVE', 'PUBLISHED'] },
      audience: { in: audiences },
    }
  }
  if (category && category !== 'ALL') {
    where = { ...where, category }
  }

  let policies = await prisma.policyDocument.findMany({
    where,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: {
      acknowledgments: {
        select: { status: true, employeeId: true, signedAt: true },
      },
    },
  })

  // â”€â”€ Per-role audience filter (HR_ADMIN bypasses).
  if (!isHR) {
    policies = policies.filter((p) => {
      const audienceRoles = parseAudienceRoles(p.audienceRoles)
      return audienceRoles.includes(user.role)
    })
  }

  if (q) {
    policies = policies.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q) ||
        (p.content ?? '').toLowerCase().includes(q),
    )
  }

  // For employees, attach their personal ack record so the UI can show status quickly
  if (!isHR && user.employee) {
    const empId = user.employee.id
    const mapped = policies.map((p) => {
      const myAck = p.acknowledgments.find((a) => a.employeeId === empId)
      return {
        ...p,
        myAckStatus: myAck?.status ?? (p.requiresAck ? 'PENDING' : 'N/A'),
        mySignedAt: myAck?.signedAt ?? null,
      }
    })
    return NextResponse.json({ policies: mapped })
  }

  return NextResponse.json({ policies })
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view' }, { status: 403 })
  }

  const body = await request.json()
  const {
    title, type, category, description, content, url,
    version, effectiveDate, audience, requiresAck, audienceRoles,
  } = body

  if (!title || !type) {
    return NextResponse.json({ error: 'title and type are required' }, { status: 400 })
  }

  // Validate audienceRoles: must be a non-empty array of allowed roles, no HR_ADMIN.
  let audienceRolesJson: string | undefined
  if (audienceRoles !== undefined) {
    if (!Array.isArray(audienceRoles) || audienceRoles.length === 0) {
      return NextResponse.json({ error: 'audienceRoles must be a non-empty array' }, { status: 400 })
    }
    for (const r of audienceRoles) {
      if (typeof r !== 'string' || !ALLOWED_AUDIENCE_ROLES.includes(r)) {
        return NextResponse.json({ error: `Invalid role in audienceRoles: ${r}` }, { status: 400 })
      }
    }
    audienceRolesJson = JSON.stringify(audienceRoles)
  } else {
    audienceRolesJson = JSON.stringify(DEFAULT_AUDIENCE_ROLES)
  }

  const policy = await prisma.policyDocument.create({
    data: {
      title,
      type,
      category: category ?? 'GENERAL',
      description: description ?? null,
      content: content ?? null,
      url: url || null,
      version: version || '1.0',
      effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
      audience: audience ?? 'ALL',
      audienceRoles: audienceRolesJson,
      requiresAck: !!requiresAck,
      status: 'DRAFT',
      reviewerIds: [],
    },
  })

  return NextResponse.json({ policy })
}
