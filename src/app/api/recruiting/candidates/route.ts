/**
 * POST /api/recruiting/candidates
 *
 *   Creates a new Candidate in stage='APPLIED' on a given requisition.
 *   HR_ADMIN or MANAGER only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { scoreCandidate } from '@/lib/candidate-scoring'

export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true },
  })
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const previewRole = request.cookies.get('hr_preview_role')?.value
  const effectiveRole = (previewRole && me.role === 'HR_ADMIN') ? previewRole : me.role
  if (!['HR_ADMIN', 'MANAGER'].includes(effectiveRole)) {
    return NextResponse.json({ error: 'Only Managers or HR can add candidates' }, { status: 403 })
  }

  const body = await request.json()
  const fullName      = String(body.fullName || '').trim()
  const email         = String(body.email || '').trim()
  const phone         = body.phone ? String(body.phone).trim() : null
  const requisitionId = body.requisitionId ? String(body.requisitionId) : ''
  const currentCompany = body.currentCompany ? String(body.currentCompany).trim() : null
  const currentRole    = body.currentRole ? String(body.currentRole).trim() : null
  const experience     = body.experience != null ? Number(body.experience) : null
  const source         = body.source ? String(body.source) : null
  const notes          = body.notes ? String(body.notes).trim().slice(0, 2000) : null

  if (!fullName)      return NextResponse.json({ error: 'Full name is required' }, { status: 400 })
  if (!email)         return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  if (!requisitionId) return NextResponse.json({ error: 'Pick the role they applied for' }, { status: 400 })

  // Verify the requisition is in a state that accepts candidates
  const req = await prisma.jobRequisition.findUnique({
    where: { id: requisitionId },
    select: { id: true, title: true, type: true, status: true, jdContent: true },
  })
  if (!req)                     return NextResponse.json({ error: 'Requisition not found' }, { status: 404 })
  if (req.status !== 'OPEN')    return NextResponse.json({ error: 'Requisition is not open' }, { status: 409 })

  const safeExp = Number.isFinite(experience as number) ? experience : null
  const { score, reason } = scoreCandidate(
    { experience: safeExp, currentCompany, currentRole, source, notes, fullName },
    { title: req.title, type: req.type, jdContent: req.jdContent },
  )

  const candidate = await prisma.candidate.create({
    data: {
      requisitionId, fullName, email, phone,
      currentCompany, currentRole,
      experience: safeExp,
      source, notes,
      stage: 'APPLIED',
      matchScore: score,
      scoreReason: reason,
    },
  })
  return NextResponse.json({ candidate }, { status: 201 })
}
