import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  // verifyToken() resolves the Clerk session first and only falls back to
  // the hr_token cookie, so gating on that cookie 401s every Clerk-signed-in
  // user before the check even runs. Ask verifyToken directly.
  if (!await verifyToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const departments = await prisma.department.findMany({ orderBy: { name: 'asc' } })
  return NextResponse.json({ departments })
}
