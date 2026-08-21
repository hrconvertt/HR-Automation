/**
 * GET  /api/settings/tax-slabs?year=2025-26 — the slabs for a tax year.
 * POST /api/settings/tax-slabs — add a slab to a year.
 *
 * FBR salaried income-tax brackets. Editable so a Finance Act revision is a
 * data change, not a deploy. HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { currentTaxYear } from '@/lib/income-tax'

async function gateHR(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!hasRole(payload, 'HR_ADMIN')) return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  return { payload }
}

export async function GET(request: NextRequest) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error

  const year = request.nextUrl.searchParams.get('year') || currentTaxYear()
  const [slabs, years] = await Promise.all([
    prisma.taxSlab.findMany({ where: { taxYear: year }, orderBy: { incomeFrom: 'asc' } }),
    prisma.taxSlab.findMany({ distinct: ['taxYear'], select: { taxYear: true }, orderBy: { taxYear: 'desc' } }),
  ])
  return NextResponse.json({ year, slabs, years: years.map((y) => y.taxYear) })
}

export async function POST(request: NextRequest) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const body = await request.json().catch(() => ({}))

  const taxYear = String(body.taxYear ?? '').trim() || currentTaxYear()
  const incomeFrom = Number(body.incomeFrom)
  if (!Number.isFinite(incomeFrom) || incomeFrom < 0) {
    return NextResponse.json({ error: 'A slab needs a valid "from" income' }, { status: 400 })
  }
  const incomeTo = body.incomeTo === null || body.incomeTo === '' || body.incomeTo === undefined
    ? null : Number(body.incomeTo)
  const ratePercent = Number(body.ratePercent)
  const fixedAmount = Number(body.fixedAmount)

  const existing = await prisma.taxSlab.findUnique({
    where: { taxYear_incomeFrom: { taxYear, incomeFrom } },
  })
  if (existing) return NextResponse.json({ error: 'A slab already starts at that income' }, { status: 409 })

  const count = await prisma.taxSlab.count({ where: { taxYear } })
  const slab = await prisma.taxSlab.create({
    data: {
      taxYear,
      incomeFrom,
      incomeTo: incomeTo !== null && Number.isFinite(incomeTo) ? incomeTo : null,
      ratePercent: Number.isFinite(ratePercent) ? ratePercent : 0,
      fixedAmount: Number.isFinite(fixedAmount) ? fixedAmount : 0,
      orderIndex: count,
    },
    select: { id: true },
  })
  return NextResponse.json({ ok: true, slab }, { status: 201 })
}
