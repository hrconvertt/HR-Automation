import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

interface RouteParams { params: Promise<{ id: string }> }

// PATCH /api/notifications/[id] — mark a single notification as read
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  const myEmpId = user?.employee?.id
  if (!myEmpId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  // Only allow marking your own notifications as read
  await prisma.notification.updateMany({
    where: { id, employeeId: myEmpId },
    data: { isRead: true },
  })

  return NextResponse.json({ success: true })
}
