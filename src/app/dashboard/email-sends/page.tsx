import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import EmailSendsClient from './email-sends-client'

export default async function EmailSendsPage() {
  const c = await cookies()
  const tok = c.get('hr_token')?.value
  const payload = tok ? verifyToken(tok) : null
  if (!payload) redirect('/login')

  const me = await prisma.user.findUnique({ where: { id: payload.userId }, select: { role: true } })
  if (!me || me.role !== 'HR_ADMIN') {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-xl">
        <p className="font-semibold text-red-700">HR only</p>
      </div>
    )
  }

  const [draft, queued, sent, failed, suppressed] = await Promise.all([
    prisma.emailSend.count({ where: { status: 'DRAFT' } }),
    prisma.emailSend.count({ where: { status: 'QUEUED' } }),
    prisma.emailSend.count({ where: { status: 'SENT' } }),
    prisma.emailSend.count({ where: { status: 'FAILED' } }),
    prisma.emailSend.count({ where: { status: 'SUPPRESSED' } }),
  ])

  return <EmailSendsClient counts={{ DRAFT: draft, QUEUED: queued, SENT: sent, FAILED: failed, SUPPRESSED: suppressed }} />
}
