import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { EmailTemplatesClient } from './email-templates-client'

const SEED_TEMPLATES = [
  { key: 'interview_invite', subject: 'Interview Invitation â€“ {{role}} at Convertt', description: 'Sent when a candidate moves to INTERVIEW stage.', variables: 'candidateName, role, interviewDate, meetingLink' },
  { key: 'offer_letter', subject: 'Employment Offer â€“ {{designation}} at Convertt', description: 'Sent when an offer is generated.', variables: 'candidateName, designation, salary, joiningDate' },
  { key: 'rejection_polite', subject: 'Application Update â€“ Convertt', description: 'Polite rejection email.', variables: 'candidateName, role' },
  { key: 'probation_confirm', subject: 'Confirmation of Employment â€“ Convertt', description: 'Sent when probation is confirmed.', variables: 'employeeName, designation, effectiveDate' },
  { key: 'settling_checkin_reminder', subject: 'Day-30 Check-in Reminder â€“ {{employeeName}}', description: 'Reminds manager to submit settling check-in.', variables: 'employeeName, managerName, dueDate' },
]

export default async function EmailTemplatesPage() {
  const c = await cookies()
  const tok = c.get('hr_token')?.value
  const payload = tok ? await verifyToken(tok) : null
  if (!payload) redirect('/login')

  const me = await prisma.user.findUnique({ where: { id: payload.userId }, select: { role: true } })
  if (!me || me.role !== 'HR_ADMIN') {
    return (
      <div className="p-6 bg-slate-50 border border-slate-100 rounded-xl">
        <p className="font-semibold text-slate-700">HR only</p>
      </div>
    )
  }

  const templates = await prisma.emailTemplate.findMany({ orderBy: [{ category: 'asc' }, { key: 'asc' }] })

  const existingKeys = new Set(templates.map((t) => t.key))
  const placeholders = SEED_TEMPLATES.filter((s) => !existingKeys.has(s.key))

  return (
    <EmailTemplatesClient
      templates={templates.map((t) => ({
        id: t.id,
        key: t.key,
        category: t.category,
        name: t.name,
        triggerEvent: t.triggerEvent,
        condition: t.condition,
        manualReview: t.manualReview,
        active: t.active,
        subject: t.subject,
        body: t.body,
        description: t.description,
        variables: t.variables,
        updatedAt: t.updatedAt.toISOString(),
      }))}
      placeholders={placeholders}
    />
  )
}
