import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { canSeePolicy } from '@/lib/policy-access'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  // verifyToken() resolves the Clerk session first and only falls back to
  // the hr_token cookie, so gating on that cookie 401s every Clerk-signed-in
  // user before the check even runs. Ask verifyToken directly.
  const payload = await verifyToken(token)
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const policies = await prisma.policyDocument.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      acknowledgments: { select: { status: true } },
    },
  })

  // Drafts and restricted policies stay with the people they are meant for.
  return NextResponse.json({ policies: policies.filter((p) => canSeePolicy(p, payload.role)) })
}
