/**
 * The old Help Desk endpoint, kept so anything still calling it works.
 * Cases live in the Help Center now — see /api/help/cases — and this route
 * reads and writes the same records with the same privacy: the person a case
 * is for, whoever raised it, and HR.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveTalentAccess } from '@/lib/talent'
import { caseScope, createCase } from '@/lib/help-center-server'
import { CASE_TYPE_VALUES } from '@/lib/help-center'

export async function GET(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tickets = await prisma.helpDeskTicket.findMany({
    where: caseScope(access),
    orderBy: { createdAt: 'desc' },
    take: 50,
    // Selected rather than included, so attachment bytes never ride along in a list.
    select: {
      id: true, ticketId: true, caseNumber: true, subject: true, category: true, serviceTeam: true,
      priority: true, status: true, createdAt: true, updatedAt: true,
      employee: { select: { fullName: true, employeeCode: true } },
      _count: { select: { replies: true } },
    },
  })
  return NextResponse.json({ tickets })
}

export async function POST(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (access.isPreviewMode) return NextResponse.json({ error: 'Switch back to HR view to create tickets' }, { status: 403 })
  if (!access.employeeId) return NextResponse.json({ error: 'No employee linked' }, { status: 400 })

  const body = (await request.json().catch(() => ({}))) as { subject?: string; category?: string; priority?: string; description?: string }
  if (!body.subject || !body.description) {
    return NextResponse.json({ error: 'subject and description are required' }, { status: 400 })
  }
  const type = body.category && CASE_TYPE_VALUES.includes(body.category) ? body.category : 'GENERAL'
  const created = await createCase({
    forEmployeeId: access.employeeId,
    createdByUserId: access.userId,
    createdByEmployeeId: access.employeeId,
    createdByName: access.userName,
    type,
    title: body.subject.slice(0, 150),
    description: body.description,
    priority: body.priority,
  })
  return NextResponse.json({ ticket: created }, { status: 201 })
}
