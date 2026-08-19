/**
 * POST   /api/exit-documents/tick — tick an exit document row by hand.
 * DELETE /api/exit-documents/tick — untick it.
 *
 * The board is normally satisfied by a file on record. Some rows are not:
 * assets handed back across a desk, a letter posted rather than scanned, a step
 * that did not apply. Without this, the only way to close such a row was to
 * upload something that was not really the evidence.
 *
 * A tick is not a file, and the board keeps saying which is which.
 *
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

async function gateHR(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const role = request.cookies.get('hr_preview_role')?.value ?? payload.role
  if (role !== 'HR_ADMIN') return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  return { payload }
}

export async function POST(request: NextRequest) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error

  const body = await request.json().catch(() => ({}))
  const employeeId = String(body.employeeId ?? '')
  const docKey = String(body.docKey ?? '')
  if (!employeeId || !docKey) {
    return NextResponse.json({ error: 'employeeId and docKey required' }, { status: 400 })
  }

  await prisma.exitDocumentTick.upsert({
    where: { employeeId_docKey: { employeeId, docKey } },
    update: { tickedById: auth.payload!.userId, note: body.note || null },
    create: {
      employeeId, docKey,
      tickedById: auth.payload!.userId,
      note: body.note || null,
    },
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error

  const { searchParams } = new URL(request.url)
  const employeeId = searchParams.get('employeeId') ?? ''
  const docKey = searchParams.get('docKey') ?? ''
  if (!employeeId || !docKey) {
    return NextResponse.json({ error: 'employeeId and docKey required' }, { status: 400 })
  }

  await prisma.exitDocumentTick.deleteMany({ where: { employeeId, docKey } })
  return NextResponse.json({ ok: true })
}
