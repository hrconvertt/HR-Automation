/**
 * GET /api/assets/next-code â†’ { next: "CON-AST-009" }
 *
 * Scans AssetAssignment.assetCode for existing CON-AST-NNN entries and
 * returns max + 1, zero-padded to 3 digits. HR-only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const prefix = 'CON-AST-'
  const rows = await prisma.assetAssignment.findMany({
    where: { assetCode: { startsWith: prefix } },
    select: { assetCode: true },
  })
  let maxN = 0
  for (const r of rows) {
    if (!r.assetCode) continue
    const n = parseInt(r.assetCode.slice(prefix.length), 10)
    if (Number.isFinite(n) && n > maxN) maxN = n
  }
  const nextNum = maxN + 1
  return NextResponse.json({ next: `${prefix}${String(nextNum).padStart(3, '0')}`, nextNum })
}
