/**
 * Show Cause — what a notice record carries beyond its stage, and who may see it.
 *
 * A notice's dates decide what happens after it: when the reply is due,
 * whether it came late, whether termination can follow. So they are fields,
 * and they are read in Pakistan time — a notice emailed at 8:15 PM on the
 * 16th was issued on the 16th, whatever UTC says.
 */
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'

export const PK_TZ = 'Asia/Karachi'

export const DELIVERY_CHANNELS = ['EMAIL', 'HAND', 'WHATSAPP', 'APP'] as const

/**
 * Every column of a notice except the letter's bytes, which only the letter
 * route reads.
 */
export const NOTICE_SELECT = {
  id: true, employeeId: true, issueType: true, severity: true, status: true, occurrenceNo: true,
  requestedById: true, requestedByName: true, meetingRequestedAt: true, meetingScheduledFor: true,
  meetingConcerns: true, meetingHeldAt: true, meetingNotes: true,
  escalationRequestedAt: true, escalationReason: true,
  issueDate: true, description: true, deadline: true, issuedBy: true,
  subject: true, caseRef: true, deliveredAt: true, deliveredVia: true, directives: true,
  informedIds: true, informedAt: true, letterName: true, letterMime: true,
  employeeResponse: true, responseAt: true,
  actionPlan: true, followUpDate: true, outcome: true, relatedRef: true,
  isDemo: true, createdAt: true, updatedAt: true,
  employee: {
    select: {
      id: true, employeeCode: true, fullName: true, designation: true, reportingManagerId: true,
      department: { select: { name: true } },
    },
  },
} as const

/**
 * A date picked as "YYYY-MM-DD" means that whole day in Pakistan: a reply due
 * on the 20th can arrive until midnight on the 20th, Lahore time.
 */
export function endOfPkDay(ymd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const d = new Date(`${ymd}T23:59:59+05:00`)
  return isNaN(d.getTime()) ? null : d
}

/** Noon in Pakistan on that day — a date with no time, stored safely inside it. */
export function pkDay(ymd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const d = new Date(`${ymd}T12:00:00+05:00`)
  return isNaN(d.getTime()) ? null : d
}

export function parseInstant(v: unknown): Date | null {
  if (typeof v !== 'string' || !v) return null
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? pkDay(v) : new Date(v)
  return d && !isNaN(d.getTime()) ? d : null
}

/** The people kept informed, with who they are to the employee. */
export async function informedPeople(notices: { informedIds: string[]; employee: { reportingManagerId: string | null } }[]) {
  const ids = [...new Set(notices.flatMap((n) => n.informedIds))]
  if (ids.length === 0) return new Map<string, { id: string; fullName: string; designation: string }>()
  const rows = await prisma.employee.findMany({
    where: { id: { in: ids } },
    select: { id: true, fullName: true, designation: true },
  })
  return new Map(rows.map((r) => [r.id, r]))
}

/** Tell each newly informed person, once, that a notice was recorded. */
export async function notifyInformed(opts: {
  ids: string[]
  employeeName: string
  subject: string | null
  issueDate: Date | null
  deadline: Date | null
  leadId: string | null
}) {
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: PK_TZ })
  for (const id of opts.ids) {
    const asLead = id === opts.leadId
    await notify({
      employeeId: id,
      type: 'SHOW_CAUSE_ISSUED',
      title: asLead ? `Show Cause Notice issued to ${opts.employeeName} (your team)` : `For your awareness: Show Cause Notice to ${opts.employeeName}`,
      message: [
        opts.subject ? `${opts.subject}.` : null,
        opts.issueDate ? `Issued ${fmt(opts.issueDate)}.` : null,
        opts.deadline ? `Response due by ${fmt(opts.deadline)}.` : null,
        asLead ? 'You are kept informed as their lead.' : 'You are kept informed of this matter.',
      ].filter(Boolean).join(' '),
      link: '/dashboard/performance?tab=showcause',
    })
  }
}
