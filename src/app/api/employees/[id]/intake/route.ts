/**
 * GET   /api/employees/[id]/intake — current values for the intake form.
 * PATCH /api/employees/[id]/intake — the new joiner saves their information.
 *
 * The new hire fills this in themselves, so the writable set is fixed to the
 * intake fields (defined once in employee-intake.ts) — someone editing their
 * own record must not be able to move their salary, department or joining date.
 *
 * Access: the employee whose record it is, or HR. Nobody else.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { INTAKE_KEYS, INTAKE_DATE_KEYS } from '@/lib/employee-intake'

interface RouteParams { params: Promise<{ id: string }> }

async function gate(request: NextRequest, employeeId: string) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const role = request.cookies.get('hr_preview_role')?.value ?? payload.role
  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { employee: { select: { id: true } } },
  })
  const isSelf = me?.employee?.id === employeeId
  const isHR = role === 'HR_ADMIN'
  if (!isSelf && !isHR) {
    return { error: NextResponse.json({ error: 'Not your form to fill' }, { status: 403 }) }
  }
  return { payload, isSelf, isHR }
}

const toISO = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '')

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const auth = await gate(request, id)
  if (auth.error) return auth.error

  const e = await prisma.employee.findUnique({ where: { id } })
  if (!e) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const values: Record<string, string> = {}
  for (const k of INTAKE_KEYS) {
    const raw = (e as unknown as Record<string, unknown>)[k]
    values[k] = raw instanceof Date ? toISO(raw) : raw == null ? '' : String(raw)
  }
  // Seed "full name as per CNIC" from the everyday name when it is still blank.
  if (!values.cnicFullName) values.cnicFullName = e.fullName ?? ''

  return NextResponse.json({
    values,
    submittedAt: e.infoFormSubmittedAt?.toISOString() ?? null,
    fullName: e.fullName,
  })
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const auth = await gate(request, id)
  if (auth.error) return auth.error

  const body = await request.json().catch(() => ({}))
  const incoming = (body.values ?? {}) as Record<string, unknown>

  const data: Record<string, unknown> = {}
  for (const k of INTAKE_KEYS) {
    if (!(k in incoming)) continue
    const v = incoming[k]
    if (INTAKE_DATE_KEYS.includes(k)) {
      // Date-only strings, stored at UTC midnight so they never drift a day.
      const s = String(v ?? '').slice(0, 10)
      const d = s ? new Date(`${s}T00:00:00Z`) : null
      data[k] = d && !Number.isNaN(d.getTime()) ? d : null
    } else {
      const s = String(v ?? '').trim()
      data[k] = s ? s.slice(0, 2000) : null
    }
  }

  // fullName is unique-ish identity — let the person correct their own spelling
  // but never blank it.
  if ('fullName' in data && !data.fullName) delete data.fullName

  // Marking it submitted is explicit, so a half-filled auto-save doesn't count.
  if (body.markSubmitted === true) data.infoFormSubmittedAt = new Date()

  const updated = await prisma.employee.update({
    where: { id },
    data,
    select: { id: true, infoFormSubmittedAt: true },
  })

  return NextResponse.json({ ok: true, submittedAt: updated.infoFormSubmittedAt?.toISOString() ?? null })
}
