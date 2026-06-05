import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import EmailQueueClient from './email-queue-client'

export default async function EmailQueuePage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
  const payload = verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({ where: { id: payload.userId } })
  if (!user || user.role !== 'HR_ADMIN') {
    return (
      <div className="p-6 bg-amber-50 border border-amber-200 rounded-2xl">
        <h2 className="text-lg font-semibold text-amber-900">HR-only area</h2>
        <p className="text-sm text-amber-800 mt-2">Only HR Admins can manage outgoing emails.</p>
      </div>
    )
  }

  const smtpConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER)
  return <EmailQueueClient smtpConfigured={smtpConfigured} />
}
