import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasAnyRole } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isHR = hasAnyRole(payload, ['HR_ADMIN'])
  const isManager = hasAnyRole(payload, ['MANAGER'])
  const myEmpId = user.employee?.id

  let where: Record<string, unknown> = {}
  if (isHR) {
    where = {}
  } else if (isManager && myEmpId) {
    where = { employee: { OR: [{ id: myEmpId }, { reportingManagerId: myEmpId }] } }
  } else if (myEmpId) {
    where = { employeeId: myEmpId }
  } else {
    return NextResponse.json({ devices: [] })
  }

  const devices = await prisma.trustedDevice.findMany({
    where,
    include: { employee: { select: { fullName: true, employeeCode: true } } },
    orderBy: [{ status: 'asc' }, { lastUsedAt: 'desc' }],
  })
  return NextResponse.json({ devices })
}

export async function PATCH(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Only HR or manager-of-the-employee can approve/revoke
  const body = await request.json()
  const { deviceId, action, label } = body as { deviceId: string; action: 'TRUST' | 'REVOKE' | 'LABEL'; label?: string }
  if (!deviceId || !action) return NextResponse.json({ error: 'deviceId + action required' }, { status: 400 })

  const dev = await prisma.trustedDevice.findUnique({ where: { id: deviceId } })
  if (!dev) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isHR = hasAnyRole(payload, ['HR_ADMIN'])
  let allowed = isHR
  if (!allowed) {
    const me = await prisma.user.findUnique({ where: { id: payload.userId }, include: { employee: { select: { id: true } } } })
    const emp = await prisma.employee.findUnique({ where: { id: dev.employeeId }, select: { reportingManagerId: true } })
    if (me?.employee?.id && emp?.reportingManagerId === me.employee.id) allowed = true
    // Employee can label their own device
    if (action === 'LABEL' && me?.employee?.id === dev.employeeId) allowed = true
  }
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (action === 'TRUST') {
    const updated = await prisma.trustedDevice.update({
      where: { id: deviceId },
      data: { status: 'TRUSTED', trustedAt: new Date(), trustedBy: payload.userId, revokedAt: null },
    })
    return NextResponse.json({ device: updated })
  }
  if (action === 'REVOKE') {
    const updated = await prisma.trustedDevice.update({
      where: { id: deviceId },
      data: { status: 'REVOKED', revokedAt: new Date() },
    })
    return NextResponse.json({ device: updated })
  }
  if (action === 'LABEL') {
    const updated = await prisma.trustedDevice.update({
      where: { id: deviceId },
      data: { label: label ?? null },
    })
    return NextResponse.json({ device: updated })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
