/**
 * PATCH  /api/culture/promotions/[id] — save the form, including the signature.
 * POST   /api/culture/promotions/[id] — generate the letter from what is saved.
 * DELETE /api/culture/promotions/[id] — remove it.
 *
 * The signature arrives as a PNG data URI drawn in the browser. It is checked
 * for shape and size and stored as-is; it is a mark on a letter, not a
 * credential, and nothing downstream trusts it as proof of identity.
 *
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { buildPromotionLetter, LEVELS } from '@/lib/promotion'

interface RouteParams { params: Promise<{ id: string }> }

/** A drawn signature is tens of KB. Anything much larger is not a signature. */
const MAX_SIGNATURE_BYTES = 400_000

async function gateHR(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const role = request.cookies.get('hr_preview_role')?.value ?? payload.role
  if (role !== 'HR_ADMIN') {
    return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  }
  return { payload }
}

const TEXT_FIELDS = [
  'newDesignation', 'reason', 'evidence', 'sponsorName', 'sponsorship',
  'fairnessNote', 'fairnessCheckedBy', 'businessNeed', 'fromDesignation',
  'signedByName', 'signedByTitle', 'letterBody', 'hrNotes', 'ceoNotes',
] as const

const NUMBER_FIELDS = [
  'newSalaryAmount', 'fromSalaryAmount', 'bandMin', 'bandMax',
] as const

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const data: Record<string, unknown> = {}

  for (const f of TEXT_FIELDS) {
    if (body[f] === undefined) continue
    const v = body[f]
    data[f] = typeof v === 'string' && v.trim() ? v.slice(0, 20000) : null
  }
  for (const f of NUMBER_FIELDS) {
    if (body[f] === undefined) continue
    const n = Number(body[f])
    data[f] = body[f] === '' || body[f] == null || !Number.isFinite(n) ? null : n
  }
  for (const f of ['fromLevel', 'toLevel'] as const) {
    if (body[f] === undefined) continue
    data[f] = (LEVELS as readonly string[]).includes(body[f]) ? body[f] : null
  }
  if (body.noticeMonths !== undefined) {
    const n = Number(body.noticeMonths)
    data.noticeMonths = Number.isFinite(n) && n > 0 ? Math.round(n) : null
  }
  if (body.effectiveDate !== undefined) {
    const d = new Date(`${String(body.effectiveDate).slice(0, 10)}T00:00:00Z`)
    if (!Number.isNaN(d.getTime())) data.effectiveDate = d
  }
  if (typeof body.status === 'string'
      && ['PENDING_HR', 'PENDING_CEO', 'APPROVED', 'REJECTED'].includes(body.status)) {
    data.status = body.status
  }

  // Signing. Clearing it (null) unsigns; setting it stamps the time.
  if (body.signatureDataUrl !== undefined) {
    const sig = body.signatureDataUrl
    if (!sig) {
      data.signatureDataUrl = null
      data.signedAt = null
    } else if (typeof sig !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig)) {
      return NextResponse.json({ error: 'Signature must be a PNG image' }, { status: 400 })
    } else if (sig.length > MAX_SIGNATURE_BYTES) {
      return NextResponse.json({ error: 'Signature image is too large' }, { status: 400 })
    } else {
      data.signatureDataUrl = sig
      data.signedAt = new Date()
    }
  }

  const promotion = await prisma.promotionRequest.update({
    where: { id },
    data,
    include: {
      employee: { select: { id: true, fullName: true, employeeCode: true, designation: true } },
    },
  })
  return NextResponse.json({ ok: true, promotion })
}

/** Generate the letter from whatever the form currently holds. */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const { id } = await params

  const p = await prisma.promotionRequest.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          fullName: true, employeeCode: true,
          department: { select: { name: true } },
          reportingManager: { select: { fullName: true } },
        },
      },
    },
  })
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const letterBody = buildPromotionLetter({
    employeeName: p.employee.fullName,
    employeeCode: p.employee.employeeCode,
    fromDesignation: p.fromDesignation,
    toDesignation: p.newDesignation,
    fromLevel: p.fromLevel,
    toLevel: p.toLevel,
    fromSalary: p.fromSalaryAmount,
    toSalary: p.newSalaryAmount,
    bandMin: p.bandMin,
    bandMax: p.bandMax,
    effectiveDate: p.effectiveDate,
    department: p.employee.department?.name ?? null,
    managerName: p.employee.reportingManager?.fullName ?? null,
    reason: p.reason,
    signedByName: p.signedByName,
    signedByTitle: p.signedByTitle,
  })

  const updated = await prisma.promotionRequest.update({
    where: { id },
    data: { letterBody, letterGeneratedAt: new Date() },
    select: { letterBody: true, letterGeneratedAt: true },
  })
  return NextResponse.json({ ok: true, ...updated })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const { id } = await params
  await prisma.promotionRequest.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
