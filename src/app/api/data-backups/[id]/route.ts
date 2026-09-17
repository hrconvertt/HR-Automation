/**
 * DELETE /api/data-backups/:id — delete a backup and its files for good.
 * HR only. The live data is untouched; only this saved copy goes.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveBackupActor } from '@/lib/data-backups-server'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await resolveBackupActor()
  if (actor instanceof NextResponse) return actor
  if (actor.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Only HR can delete a backup.' }, { status: 403 })
  }
  const { id } = await params
  const found = await prisma.dataBackup.findUnique({ where: { id }, select: { id: true } })
  if (!found) return NextResponse.json({ error: 'Backup not found.' }, { status: 404 })
  await prisma.dataBackup.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
