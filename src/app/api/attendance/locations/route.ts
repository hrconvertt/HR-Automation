import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

function unauth(msg = 'Unauthorized', status = 401) {
  return NextResponse.json({ error: msg }, { status })
}

async function requireHR(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return { error: unauth() }
  if (!hasRole(payload, 'HR_ADMIN')) return { error: unauth('Forbidden', 403) }
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return { error: unauth('Switch back to HR view to perform this action', 403) }
  }
  return { payload }
}

export async function GET(request: NextRequest) {
  const auth = await requireHR(request)
  if (auth.error) return auth.error
  const locations = await prisma.location.findMany({ orderBy: { createdAt: 'asc' } })
  return NextResponse.json({ locations })
}

export async function POST(request: NextRequest) {
  const auth = await requireHR(request)
  if (auth.error) return auth.error
  try {
    const body = await request.json()
    const { name, kind, ipCidrs, ssids, lat, lng, radiusMeters, notes, active } = body
    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })
    const loc = await prisma.location.create({
      data: {
        name,
        kind: kind ?? 'OFFICE',
        ipCidrs: JSON.stringify(Array.isArray(ipCidrs) ? ipCidrs : []),
        ssids: JSON.stringify(Array.isArray(ssids) ? ssids : []),
        lat: lat ?? null,
        lng: lng ?? null,
        radiusMeters: radiusMeters ?? 200,
        notes: notes ?? null,
        active: active ?? true,
      },
    })
    return NextResponse.json({ location: loc })
  } catch (err) {
    console.error('[POST /api/attendance/locations]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
