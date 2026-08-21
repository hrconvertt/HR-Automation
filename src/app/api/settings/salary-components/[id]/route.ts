/**
 * PATCH  /api/settings/salary-components/[id] — edit or deactivate a component.
 * DELETE /api/settings/salary-components/[id] — remove a non-statutory one.
 *
 * Statutory components (EOBI, tax, social security) can be deactivated but not
 * deleted, so the library always remembers the shape of what the law requires.
 *
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { COMPONENT_TYPES, CALCULATION_BASES } from '@/lib/salary-components'

interface RouteParams { params: Promise<{ id: string }> }

async function gateHR(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!hasRole(payload, 'HR_ADMIN')) return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  return { payload }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const n = String(body.name).trim()
    if (!n) return NextResponse.json({ error: 'A component needs a name' }, { status: 400 })
    data.name = n.slice(0, 120)
  }
  if ((COMPONENT_TYPES as readonly string[]).includes(body.type)) data.type = body.type
  if ((CALCULATION_BASES as readonly string[]).includes(body.calculationBasis)) data.calculationBasis = body.calculationBasis
  if (body.defaultValue !== undefined) {
    const v = Number(body.defaultValue)
    data.defaultValue = Number.isFinite(v) && v >= 0 ? v : 0
  }
  if (body.isTaxable !== undefined) data.isTaxable = !!body.isTaxable
  if (body.active !== undefined) data.active = !!body.active

  const component = await prisma.salaryComponent.update({ where: { id }, data })
  return NextResponse.json({ ok: true, component })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const { id } = await params

  const c = await prisma.salaryComponent.findUnique({ where: { id }, select: { isStatutory: true } })
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (c.isStatutory) {
    return NextResponse.json(
      { error: 'A statutory component cannot be deleted. Deactivate it instead.' },
      { status: 400 },
    )
  }
  await prisma.salaryComponent.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
