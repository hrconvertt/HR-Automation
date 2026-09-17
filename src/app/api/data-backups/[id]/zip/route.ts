/**
 * GET /api/data-backups/:id/zip — the whole backup as one .zip, one folder
 * per area (People, Leave, Work from home, and so on) with its CSVs inside.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { backupName, csvBytes, folderOrder, zip } from '@/lib/data-backups'
import { resolveBackupActor } from '@/lib/data-backups-server'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await resolveBackupActor()
  if (actor instanceof NextResponse) return actor
  const { id } = await params

  const backup = await prisma.dataBackup.findUnique({ where: { id }, include: { files: true } })
  if (!backup) return NextResponse.json({ error: 'Backup not found.' }, { status: 404 })

  const root = backupName(backup.createdAt)
  const files = [...backup.files].sort(
    (a, z) => folderOrder(a.folder) - folderOrder(z.folder) || a.fileName.localeCompare(z.fileName),
  )
  const body = zip(files.map((f) => ({ path: `${root}/${f.folder}/${f.fileName}`, data: csvBytes(f.gz) })))

  const now = new Date()
  await prisma.dataBackup.update({
    where: { id },
    data: { downloadedAt: backup.downloadedAt ?? now, downloadedByName: backup.downloadedByName ?? actor.name },
  })
  await prisma.dataBackupFile.updateMany({ where: { backupId: id, downloadedAt: null }, data: { downloadedAt: now } })

  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${root}.zip"`,
      'Cache-Control': 'no-store',
    },
  })
}
