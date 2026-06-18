import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CultureNotificationsClient } from './culture-notifications-client'

export default async function CultureNotificationsSettingsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({ where: { id: payload.userId } })
  if (!user) redirect('/login')
  if (user.role !== 'HR_ADMIN') redirect('/dashboard')

  let config = await prisma.cultureNotificationConfig.findFirst()
  if (!config) config = await prisma.cultureNotificationConfig.create({ data: {} })

  return (
    <CultureNotificationsClient
      initial={{
        birthdayNotificationScope: config.birthdayNotificationScope,
        anniversaryNotificationScope: config.anniversaryNotificationScope,
        eventNotificationScope: config.eventNotificationScope,
      }}
    />
  )
}
