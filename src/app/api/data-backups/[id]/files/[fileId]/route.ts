/** GET /api/data-backups/:id/files/:fileId — one CSV file from a backup. */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { backupName, csvBytes } from '@/lib/data-backups'
import { resolveBackupActor } from '@/lib/data-backups-server'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const actor = await resolveBackupActor()
  if (actor instanceof NextResponse) return actor
  const { id, fileId } = await params

  const file = await prisma.dataBackupFile.findFirst({
    where: { id: fileId, backupId: id },
    include: { backup: { select: { createdAt: true } } },
  })
  if (!file) return NextResponse.json({ error: 'File not found.' }, { status: 404 })

  await prisma.dataBackupFile.update({ where: { id: file.id }, data: { downloadedAt: new Date() } })
  // Taking every file one by one counts as downloading the backup.
  const left = await prisma.dataBackupFile.count({ where: { backupId: id, downloadedAt: null } })
  if (left === 0) {
    await prisma.dataBackup.updateMany({
      where: { id, downloadedAt: null },
      data: { downloadedAt: new Date(), downloadedByName: actor.name },
    })
  }

  const name = `${backupName(file.backup.createdAt)}-${file.fileName}`
  return new NextResponse(new Uint8Array(csvBytes(file.gz)), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  })
}
