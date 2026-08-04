/**
 * Applying a holiday to attendance.
 *
 * Lives here rather than in the PATCH route because sending the notice applies
 * it too — announcing a closure and marking it are the same decision, and two
 * copies of this would drift the moment one of them changed.
 *
 * Un-applying reverses exactly what applying wrote, matched on the holiday's
 * name in the attendance note, so a genuine leave or a manual correction on the
 * same date survives.
 */

import { prisma } from './prisma'

export interface ApplyOutcome {
  changed: number
  employeesAffected: number
}

export async function applyHoliday(
  holidayId: string,
  applied: boolean,
  userId: string,
): Promise<ApplyOutcome> {
  const holiday = await prisma.holiday.findUnique({
    where: { id: holidayId },
    select: { id: true, name: true, date: true, type: true, applied: true },
  })
  if (!holiday) return { changed: 0, employeesAffected: 0 }

  const date = holiday.date
  // A work-from-home day is still a working day — it marks present from home,
  // not closed.
  const mark = holiday.type === 'WFH' ? 'PRESENT' : 'HOLIDAY'
  const workType = holiday.type === 'WFH' ? 'WFH' : 'ONSITE'

  // Only people employed on the day. A closure cannot apply to someone who had
  // not joined, or had already left.
  const employees = await prisma.employee.findMany({
    where: {
      joiningDate: { lte: date },
      OR: [{ exitDate: null }, { exitDate: { gte: date } }],
    },
    select: { id: true },
  })

  let changed = 0

  if (applied) {
    for (const e of employees) {
      const existing = await prisma.attendanceLog.findFirst({
        where: { employeeId: e.id, date },
        select: { id: true, status: true },
      })
      if (existing) {
        if (existing.status !== mark) {
          await prisma.attendanceLog.update({
            where: { id: existing.id },
            data: { status: mark, workType, notes: holiday.name },
          })
          changed++
        }
      } else {
        await prisma.attendanceLog.create({
          data: { employeeId: e.id, date, status: mark, workType, notes: holiday.name },
        })
        changed++
      }
    }
  } else {
    const mine = await prisma.attendanceLog.findMany({
      where: { date, notes: holiday.name },
      select: { id: true },
    })
    for (const log of mine) {
      await prisma.attendanceLog.update({
        where: { id: log.id },
        data: { status: 'PRESENT', workType: 'ONSITE', notes: null },
      })
      changed++
    }
  }

  await prisma.holiday.update({
    where: { id: holidayId },
    data: {
      applied,
      appliedAt: applied ? new Date() : null,
      appliedById: applied ? userId : null,
    },
  })

  return { changed, employeesAffected: employees.length }
}
