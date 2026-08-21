/**
 * POST /api/learning/certifications — record a credential an employee holds.
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'HR only' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const employeeId = String(body.employeeId ?? '')
  const name = String(body.name ?? '').trim()
  const issuedBy = String(body.issuedBy ?? '').trim()
  if (!employeeId || !name) {
    return NextResponse.json({ error: 'Pick the employee and name the certification' }, { status: 400 })
  }

  const issuedDate = body.issuedDate
    ? new Date(`${String(body.issuedDate).slice(0, 10)}T00:00:00Z`)
    : new Date()
  const expiryDate = body.expiryDate
    ? new Date(`${String(body.expiryDate).slice(0, 10)}T00:00:00Z`)
    : null

  const cert = await prisma.certification.create({
    data: {
      employeeId,
      name: name.slice(0, 200),
      issuedBy: issuedBy || 'Unknown',
      issuedDate: Number.isNaN(issuedDate.getTime()) ? new Date() : issuedDate,
      expiryDate: expiryDate && !Number.isNaN(expiryDate.getTime()) ? expiryDate : null,
      credentialUrl: body.credentialUrl ? String(body.credentialUrl).slice(0, 500) : null,
    },
    select: { id: true },
  })
  return NextResponse.json({ ok: true, cert }, { status: 201 })
}
