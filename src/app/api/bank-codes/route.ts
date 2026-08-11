/**
 * GET   /api/bank-codes — the bank list the salary sheet is coded against.
 * POST  /api/bank-codes — add a bank.
 * PATCH /api/bank-codes — edit one, by id.
 *
 * Reference data HR maintains. It used to be a hardcoded map in
 * src/lib/bank-codes.ts, so a new bank or a corrected name needed a deploy.
 *
 * GET is open to any signed-in user because the employee form reads it to
 * offer a code; writing is HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

async function gateHR(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (payload.role !== 'HR_ADMIN') {
    return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  }
  const preview = request.cookies.get('hr_preview_role')?.value
  if (preview && preview !== 'HR_ADMIN') {
    return { error: NextResponse.json({ error: 'Switch back to HR view to edit banks' }, { status: 403 }) }
  }
  return { payload }
}

export async function GET(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const banks = await prisma.bankCode.findMany({ orderBy: { bankName: 'asc' } })
  return NextResponse.json({ banks })
}

/** Trimmed, uppercased where it is a code, and empty means null not "". */
function clean(v: unknown, upper = false): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().slice(0, 120)
  if (!s) return null
  return upper ? s.toUpperCase() : s
}

export async function POST(request: NextRequest) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const body = await request.json().catch(() => ({}))

  const bankName = clean(body.bankName)
  const bankCode = clean(body.bankCode, true)
  if (!bankName || !bankCode) {
    return NextResponse.json({ error: 'A bank needs a name and a code' }, { status: 400 })
  }
  const clash = await prisma.bankCode.findUnique({ where: { bankName } })
  if (clash) {
    return NextResponse.json({ error: `${bankName} is already on the list` }, { status: 409 })
  }

  const bank = await prisma.bankCode.create({
    data: {
      bankName,
      bankCode,
      ibanPrefix: clean(body.ibanPrefix, true),
      swift: clean(body.swift, true),
      isOwnBank: !!body.isOwnBank,
      notes: clean(body.notes),
      isActive: body.isActive !== false,
    },
  })
  return NextResponse.json({ ok: true, bank }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const body = await request.json().catch(() => ({}))
  const id = typeof body.id === 'string' ? body.id : null
  if (!id) return NextResponse.json({ error: 'Which bank?' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (body.bankName !== undefined) {
    const v = clean(body.bankName)
    if (!v) return NextResponse.json({ error: 'A bank needs a name' }, { status: 400 })
    data.bankName = v
  }
  if (body.bankCode !== undefined) {
    const v = clean(body.bankCode, true)
    if (!v) return NextResponse.json({ error: 'A bank needs a code' }, { status: 400 })
    data.bankCode = v
  }
  if (body.ibanPrefix !== undefined) data.ibanPrefix = clean(body.ibanPrefix, true)
  if (body.swift !== undefined) data.swift = clean(body.swift, true)
  if (body.notes !== undefined) data.notes = clean(body.notes)
  if (typeof body.isOwnBank === 'boolean') data.isOwnBank = body.isOwnBank
  if (typeof body.isActive === 'boolean') data.isActive = body.isActive
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
  }

  const bank = await prisma.bankCode.update({ where: { id }, data })
  return NextResponse.json({ ok: true, bank })
}

export async function DELETE(request: NextRequest) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Which bank?' }, { status: 400 })
  await prisma.bankCode.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
