/**
 * /api/admin/self-heal
 *
 *   GET  → run the full health scan, return report
 *   POST → body: { id: '<checkId>' } → run the matching auto-fix
 *
 * HR_ADMIN only. Preview mode blocks POST.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { runHealthScan, runHealer } from '@/lib/self-heal'

async function gateHR(request: NextRequest, requireDestructive = false) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const me = await prisma.user.findUnique({ where: { id: payload.userId }, select: { role: true } })
  if (!me || me.role !== 'HR_ADMIN') return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  if (requireDestructive) {
    const previewRole = request.cookies.get('hr_preview_role')?.value
    if (previewRole && previewRole !== 'HR_ADMIN') {
      return { error: NextResponse.json({ error: 'Switch back to HR view to run heal actions' }, { status: 403 }) }
    }
  }
  return {}
}

export async function GET(request: NextRequest) {
  const { error } = await gateHR(request)
  if (error) return error
  const report = await runHealthScan()
  return NextResponse.json({ report })
}

export async function POST(request: NextRequest) {
  const { error } = await gateHR(request, true)
  if (error) return error
  const body = await request.json()
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const result = await runHealer(id)
  if ('error' in result) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
