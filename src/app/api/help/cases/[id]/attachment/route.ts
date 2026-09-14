/** GET /api/help/cases/[id]/attachment — the file attached when the case was opened. */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveTalentAccess } from '@/lib/talent'
import { canSeeCase } from '@/lib/help-center-server'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, ctx: RouteContext) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const t = await prisma.helpDeskTicket.findUnique({
    where: { id },
    select: { employeeId: true, createdById: true, attachmentBytes: true, attachmentMime: true, attachmentName: true },
  })
  if (!t || !canSeeCase(access, t)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!t.attachmentBytes) return NextResponse.json({ error: 'No attachment' }, { status: 404 })

  const buf = Buffer.isBuffer(t.attachmentBytes) ? t.attachmentBytes : Buffer.from(t.attachmentBytes as unknown as ArrayBuffer)
  const name = t.attachmentName ?? 'attachment'
  const ascii = name.replace(/[^ -~]/g, '-').replace(/"/g, '')
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': t.attachmentMime ?? 'application/octet-stream',
      'Content-Length': String(buf.length),
      'Content-Disposition': `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
