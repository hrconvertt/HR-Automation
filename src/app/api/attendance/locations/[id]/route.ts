import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

interface RouteParams { params: Promise<{ id: string }> }

async function requireHR(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view' }, { status: 403 })
  }
  return null
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const err = await requireHR(request)
  if (err) return err
  const { id } = await params
  try {
    const body = await request.json()
    const { name, kind, ipCidrs, ssids, lat, lng, radiusMeters, notes, active } = body
    const loc = await prisma.location.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(kind !== undefined ? { kind } : {}),
        ...(ipCidrs !== undefined ? { ipCidrs: JSON.stringify(ipCidrs) } : {}),
        ...(ssids !== undefined ? { ssids: JSON.stringify(ssids) } : {}),
        ...(lat !== undefined ? { lat } : {}),
        ...(lng !== undefined ? { lng } : {}),
        ...(radiusMeters !== undefined ? { radiusMeters } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(active !== undefined ? { active } : {}),
      },
    })
    return NextResponse.json({ location: loc })
  } catch (e) {
    console.error('[PATCH location]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const err = await requireHR(request)
  if (err) return err
  const { id } = await params
  await prisma.location.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
