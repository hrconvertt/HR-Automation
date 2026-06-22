import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'

/**
 * Daily cron — sends welcome notifications/emails on the employee's joining
 * day. We don't actually send SMTP here (that's handled elsewhere); we mark
 * the checklist + drop an in-app notification. EmailDraft creation can be
 * added when SMTP is wired.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

  const due = await prisma.onboardingChecklist.findMany({
    where: {
      welcomeEmailScheduledFor: { lte: todayEnd, not: null },
      welcomeEmailSentAt: null,
      employee: { status: { notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE', 'LAYOFF'] } },
    },
    include: { employee: { select: { id: true, fullName: true, joiningDate: true, workLocationAddress: true } } },
  })

  for (const c of due) {
    await prisma.onboardingChecklist.update({
      where: { id: c.id },
      data: { welcomeEmailSentAt: new Date(), welcomeEmailSent: true },
    })
    await notify({
      employeeId: c.employee.id,
      type: 'GENERAL',
      title: 'Welcome to Convertt!',
      message: `Today is your first day. Report at 9:00 AM${c.employee.workLocationAddress ? ` to ${c.employee.workLocationAddress}` : ''}. Bring your CNIC, bank details, and educational certificates. Dress code: business casual.`,
      link: `/dashboard/onboarding/${c.employee.id}`,
    })
  }

  return NextResponse.json({ sent: due.length })
}
