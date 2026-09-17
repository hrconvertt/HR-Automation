/**
 * GET  /api/data-backups — every backup with its files (no file contents),
 *                          newest first, plus when the next one is due.
 * POST /api/data-backups — make a backup now.
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { BACKUP_INTERVAL_DAYS, createBackup, datasetLabel, folderOrder } from '@/lib/data-backups'
import { resolveBackupActor } from '@/lib/data-backups-server'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function GET() {
  const actor = await resolveBackupActor()
  if (actor instanceof NextResponse) return actor

  const backups = await prisma.dataBackup.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      files: {
        select: { id: true, folder: true, dataset: true, fileName: true, rowCount: true, sizeBytes: true, downloadedAt: true },
      },
    },
  })
  const latest = backups[0]
  const nextDueAt = latest
    ? new Date(latest.createdAt.getTime() + BACKUP_INTERVAL_DAYS * 86_400_000)
    : new Date()

  return NextResponse.json({
    role: actor.role,
    nextDueAt,
    backups: backups.map((b) => ({
      ...b,
      files: b.files
        .map((f) => ({ ...f, label: datasetLabel(f.dataset) }))
        .sort((a, z) => folderOrder(a.folder) - folderOrder(z.folder) || a.label.localeCompare(z.label)),
    })),
  })
}

export async function POST() {
  const actor = await resolveBackupActor()
  if (actor instanceof NextResponse) return actor
  const backup = await createBackup({ trigger: 'MANUAL', createdByName: actor.name })
  return NextResponse.json({ backup })
}
