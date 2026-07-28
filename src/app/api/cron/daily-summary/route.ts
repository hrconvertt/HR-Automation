import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Daily cron — for each active employee with punches today, summarise
// worked / idle / overtime and drop a Notification + EmailDraft.
async function handle(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (process.env.CRON_SECRET) {
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // Read idle threshold
  const idleCfg = await prisma.config.findUnique({ where: { key: 'idleThresholdMinutes' } })
  const idleThreshold = Math.max(1, Number(idleCfg?.value ?? 15))

  // Today's bounds (server local — DB stores as DateTime)
  const now = new Date()
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)

  const punches = await prisma.attendancePunch.findMany({
    where: { date: { gte: dayStart, lt: dayEnd } },
    orderBy: { timestamp: 'asc' },
  })

  // Group by employee
  const byEmp = new Map<string, typeof punches>()
  for (const p of punches) {
    const arr = byEmp.get(p.employeeId) ?? []
    arr.push(p)
    byEmp.set(p.employeeId, arr)
  }

  let processed = 0
  for (const [employeeId, list] of byEmp.entries()) {
    const emp = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, fullName: true, email: true, status: true },
    })
    if (!emp || emp.status !== 'ACTIVE') continue

    // Pair IN→OUT
    let workedMin = 0
    let idleMin = 0
    let lastIn: Date | null = null
    let lastOut: Date | null = null
    for (const p of list) {
      if (p.type === 'IN') {
        if (lastOut) {
          const gap = (p.timestamp.getTime() - lastOut.getTime()) / 60000
          if (gap >= idleThreshold) idleMin += gap
        }
        lastIn = p.timestamp
        lastOut = null
      } else if (p.type === 'OUT' && lastIn) {
        workedMin += (p.timestamp.getTime() - lastIn.getTime()) / 60000
        lastOut = p.timestamp
        lastIn = null
      }
    }

    const workedH = Math.floor(workedMin / 60)
    const workedM = Math.round(workedMin % 60)
    const idleRound = Math.round(idleMin)
    const overtimeMin = Math.max(0, workedMin - 480)
    const otH = Math.floor(overtimeMin / 60)
    const otM = Math.round(overtimeMin % 60)

    // Dedup notification for today
    const existing = await prisma.notification.findFirst({
      where: {
        employeeId: emp.id,
        type: 'DAILY_SUMMARY',
        createdAt: { gte: dayStart, lt: dayEnd },
      },
    })
    if (existing) continue

    const message = `${workedH}h ${workedM}m worked · ${idleRound}m idle · ${otH}h ${otM}m overtime`
    await prisma.notification.create({
      data: {
        employeeId: emp.id,
        type: 'DAILY_SUMMARY',
        title: "Today's summary",
        message,
      },
    })
    await prisma.emailDraft.create({
      data: {
        employeeId: emp.id,
        toEmail: emp.email,
        toName: emp.fullName,
        subject: "Today's summary",
        bodyHtml: `<p>Hi ${emp.fullName},</p><p>${message}</p>`,
        trigger: 'DAILY_SUMMARY',
        status: 'DRAFT',
      },
    })
    processed += 1
  }

  return NextResponse.json({ ok: true, processed })
}

export async function GET(request: NextRequest) {
  return handle(request)
}
export async function POST(request: NextRequest) {
  return handle(request)
}
