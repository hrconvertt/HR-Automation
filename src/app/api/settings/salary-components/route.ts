/**
 * GET  /api/settings/salary-components — the component library + the basic %.
 * POST /api/settings/salary-components — add a component.
 *
 * The org-level salary structure template. Employee-level assignment is a later
 * phase; this is the library everything else will build on.
 *
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { COMPONENT_TYPES, CALCULATION_BASES } from '@/lib/salary-components'

async function gateHR(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!hasRole(payload, 'HR_ADMIN')) return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  return { payload }
}

export async function GET(request: NextRequest) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error

  const [components, basicCfg] = await Promise.all([
    prisma.salaryComponent.findMany({ orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }] }),
    prisma.config.findUnique({ where: { key: 'salaryStructure:basicPctOfGross' } }),
  ])
  return NextResponse.json({
    components,
    basicPctOfGross: basicCfg ? Number(basicCfg.value) : 60,
  })
}

export async function POST(request: NextRequest) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const body = await request.json().catch(() => ({}))

  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'A component needs a name' }, { status: 400 })

  const type = (COMPONENT_TYPES as readonly string[]).includes(body.type) ? body.type : 'earning'
  const calculationBasis = (CALCULATION_BASES as readonly string[]).includes(body.calculationBasis)
    ? body.calculationBasis : 'fixed_amount'
  const value = Number(body.defaultValue)

  const count = await prisma.salaryComponent.count()
  const component = await prisma.salaryComponent.create({
    data: {
      name: name.slice(0, 120),
      type,
      calculationBasis,
      defaultValue: Number.isFinite(value) && value >= 0 ? value : 0,
      isTaxable: body.isTaxable !== false,
      isStatutory: false,          // only the seeded statutory ones are; new ones are not
      active: true,
      orderIndex: count + 1,
    },
    select: { id: true },
  })
  return NextResponse.json({ ok: true, component }, { status: 201 })
}
