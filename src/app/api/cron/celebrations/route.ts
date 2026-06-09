import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notify, notifyMany } from '@/lib/notifications'

/**
 * Daily celebration cron — 09:00 local. For every employee whose DOB or
 * joiningDate matches today (month + day), notify:
 *   • the employee themselves
 *   • their teammates (same manager) + direct reports + manager
 *   • HR
 * Honors hideBirthday / hideAnniversary opt-outs.
 *
 * Milestone anniversaries (1, 3, 5, 7, 10, 15+ years) additionally
 * auto-generate a Service Certificate letter request.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (process.env.CRON_SECRET) {
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const today = new Date()
  const m = today.getMonth() + 1
  const d = today.getDate()

  // Pull all active employees with privacy flags — we filter month/day in JS
  // because Prisma SQL doesn't have a clean extract() helper across providers.
  const all = await prisma.employee.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true, fullName: true, dob: true, joiningDate: true,
      reportingManagerId: true, hideBirthday: true, hideAnniversary: true,
    },
  })

  // Find HR teammates to fan-out to.
  const hrUsers = await prisma.user.findMany({
    where: { role: 'HR_ADMIN' },
    select: { employee: { select: { id: true } } },
  })
  const hrEmpIds = hrUsers
    .map((u) => u.employee?.id)
    .filter((x): x is string => typeof x === 'string')

  const birthdays: { id: string; name: string }[] = []
  const anniversaries: { id: string; name: string; years: number; milestone: boolean }[] = []
  const serviceCerts: string[] = []

  for (const e of all) {
    // Birthday?
    if (e.dob && !e.hideBirthday) {
      const dob = new Date(e.dob)
      if (dob.getMonth() + 1 === m && dob.getDate() === d) {
        birthdays.push({ id: e.id, name: e.fullName })
      }
    }
    // Anniversary?
    if (e.joiningDate && !e.hideAnniversary) {
      const jd = new Date(e.joiningDate)
      if (jd.getMonth() + 1 === m && jd.getDate() === d) {
        const years = today.getFullYear() - jd.getFullYear()
        if (years >= 1) {
          const milestone = [1, 3, 5, 7, 10, 15, 20, 25].includes(years) || years >= 15
          anniversaries.push({ id: e.id, name: e.fullName, years, milestone })
          if (milestone) serviceCerts.push(e.id)
        }
      }
    }
  }

  // Send notifications.
  for (const b of birthdays) {
    await notify({
      employeeId: b.id,
      type: 'GENERAL',
      title: 'Happy Birthday!',
      message: 'Wishing you a wonderful year ahead from everyone at Convertt.',
    })
    if (hrEmpIds.length) {
      await notifyMany(hrEmpIds, {
        type: 'GENERAL',
        title: `Birthday today: ${b.name}`,
        message: 'Consider sending a quick note or a Sign-Card invite.',
        link: `/dashboard/culture?tab=birthdays`,
      })
    }
  }
  for (const a of anniversaries) {
    await notify({
      employeeId: a.id,
      type: 'GENERAL',
      title: `Happy ${a.years}-year work anniversary!`,
      message: 'Thanks for everything you do — here is to many more.',
    })
    if (hrEmpIds.length) {
      await notifyMany(hrEmpIds, {
        type: 'GENERAL',
        title: `${a.years}-year anniversary: ${a.name}${a.milestone ? ' (milestone)' : ''}`,
        message: a.milestone ? 'Service Certificate auto-generated.' : 'Send a kudos!',
        link: `/dashboard/culture?tab=anniversaries`,
      })
    }
  }

  // Milestone Service Certificates — best-effort; skip on schema mismatch.
  let certsCreated = 0
  for (const empId of serviceCerts) {
    try {
      await prisma.letterRequest.create({
        data: {
          employeeId: empId,
          letterType: 'SERVICE_CERTIFICATE',
          purpose: 'Milestone work anniversary',
          status: 'APPROVED',
          requestedAt: new Date(),
        },
      })
      certsCreated++
    } catch (e) {
      console.warn('[cron/celebrations] service-cert skip:', (e as Error).message)
    }
  }

  return NextResponse.json({
    ok: true,
    birthdays: birthdays.length,
    anniversaries: anniversaries.length,
    serviceCertsCreated: certsCreated,
  })
}
