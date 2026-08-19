/**
 * PATCH /api/onboarding/checklist-grid
 *
 * Flip one or many checklist cells across employees in one call. The grid is
 * edited the way a spreadsheet is — several ticks, then save — so sending one
 * request per cell would mean a half-saved table if the tab is closed midway.
 *
 * Body: { changes: [{ employeeId, key, value }, …] }
 *
 * Creates the checklist row on first tick, because an employee imported before
 * the onboarding module existed has no row and should not need one made by hand.
 *
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { CHECKLIST_KEYS } from '@/lib/onboarding-checklist'

interface Change { employeeId: string; key: string; value: boolean }

export async function PATCH(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = request.cookies.get('hr_preview_role')?.value ?? payload.role
  if (role !== 'HR_ADMIN') return NextResponse.json({ error: 'HR only' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  if (!Array.isArray(body.changes)) {
    return NextResponse.json({ error: 'changes[] is required' }, { status: 400 })
  }

  // Collapse to one update per employee — a row edited across five columns is
  // one write, not five.
  const perEmployee = new Map<string, Record<string, boolean>>()
  for (const c of body.changes as Change[]) {
    if (!c?.employeeId || !CHECKLIST_KEYS.includes(c.key)) continue
    const cur = perEmployee.get(c.employeeId) ?? {}
    cur[c.key] = !!c.value
    perEmployee.set(c.employeeId, cur)
  }
  if (perEmployee.size === 0) {
    return NextResponse.json({ ok: true, updated: 0 })
  }

  await prisma.$transaction(
    [...perEmployee.entries()].map(([employeeId, data]) =>
      prisma.onboardingChecklist.upsert({
        where: { employeeId },
        update: data,
        create: { employeeId, ...data },
      }),
    ),
  )

  return NextResponse.json({ ok: true, updated: perEmployee.size })
}
