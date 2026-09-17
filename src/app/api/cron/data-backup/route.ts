/**
 * Daily cron — the fortnightly data backup.
 *
 * When the newest backup is 14 days old (or there is none), make one and tell
 * HR it is ready to download. While the newest backup has not been downloaded,
 * remind HR again every 3 days. Downloading it (the .zip, or every file one by
 * one) is what stops the reminders.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notifyMany } from '@/lib/notifications'
import { BACKUP_INTERVAL_DAYS, REMIND_EVERY_DAYS, createBackup } from '@/lib/data-backups'

export const runtime = 'nodejs'
export const maxDuration = 120

const DAY = 86_400_000
const LINK = '/dashboard/settings/data-backups'

async function hrEmployeeIds(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true, OR: [{ role: 'HR_ADMIN' }, { userRoles: { some: { role: 'HR_ADMIN' } } }] },
    select: { employee: { select: { id: true } } },
  })
  return Array.from(new Set(users.map((u) => u.employee?.id).filter((x): x is string => !!x)))
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const now = Date.now()
  const latest = await prisma.dataBackup.findFirst({ orderBy: { createdAt: 'desc' } })

  if (!latest || now - latest.createdAt.getTime() >= BACKUP_INTERVAL_DAYS * DAY) {
    const backup = await createBackup({ trigger: 'SCHEDULED' })
    await notifyMany(await hrEmployeeIds(), {
      type: 'GENERAL',
      title: 'Download your data backup',
      message: `This fortnight's backup is ready: ${backup.fileCount} CSV files, ${backup.rowCount.toLocaleString('en-US')} rows. Open Data backups and click "Download all (.zip)".`,
      link: LINK,
    })
    await prisma.dataBackup.update({ where: { id: backup.id }, data: { lastRemindedAt: new Date() } })
    return NextResponse.json({ created: backup.id })
  }

  const lastNudge = (latest.lastRemindedAt ?? latest.createdAt).getTime()
  if (!latest.downloadedAt && now - lastNudge >= REMIND_EVERY_DAYS * DAY) {
    const day = latest.createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' })
    await notifyMany(await hrEmployeeIds(), {
      type: 'GENERAL',
      title: 'Reminder: data backup not downloaded yet',
      message: `The backup made on ${day} has not been downloaded. Open Data backups and click "Download all (.zip)".`,
      link: LINK,
    })
    await prisma.dataBackup.update({ where: { id: latest.id }, data: { lastRemindedAt: new Date() } })
    return NextResponse.json({ reminded: latest.id })
  }

  return NextResponse.json({ ok: true })
}
