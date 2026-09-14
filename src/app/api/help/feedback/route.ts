/**
 * POST /api/help/feedback — "Was this article helpful?"
 * body: { refType: 'ARTICLE' | 'POLICY' | 'GUIDE', refId, helpful: boolean }
 *
 * One vote per person; voting again changes it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveTalentAccess } from '@/lib/talent'
import { FEEDBACK_REFS } from '@/lib/help-center'

export async function POST(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.employeeId || access.isPreviewMode) {
    return NextResponse.json({ error: 'Your login is not linked to an employee record.' }, { status: 403 })
  }
  const body = (await request.json().catch(() => ({}))) as { refType?: string; refId?: string; helpful?: boolean }
  if (!body.refType || !(FEEDBACK_REFS as readonly string[]).includes(body.refType) || !body.refId || typeof body.helpful !== 'boolean') {
    return NextResponse.json({ error: 'refType, refId and helpful are required' }, { status: 400 })
  }
  const refId = body.refId.slice(0, 100)
  await prisma.articleFeedback.upsert({
    where: { refType_refId_employeeId: { refType: body.refType, refId, employeeId: access.employeeId } },
    update: { helpful: body.helpful },
    create: { refType: body.refType, refId, employeeId: access.employeeId, helpful: body.helpful },
  })
  return NextResponse.json({ ok: true })
}
