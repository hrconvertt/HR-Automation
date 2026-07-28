import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  if (!token || !await verifyToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const policies = await prisma.policyDocument.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      acknowledgments: { select: { status: true } },
    },
  })

  return NextResponse.json({ policies })
}
