/**
 * Server side of Letters: who is asking, the employee fields the templates
 * need, and the draft text for any letter type.
 */
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { generateLetter, type LetterType } from '@/lib/letter-templates'
import { bodyToText, letterLabel, DEFAULT_SIGNATORY, type LetterText } from '@/lib/letter-text'

export async function resolveLetterAccess(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return null
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true, fullName: true } } },
  })
  if (!user) return null
  const previewRole = user.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role
  return {
    userId: user.id,
    effectiveRole,
    /** HR acting as HR: the only one who may write, approve or change a letter. */
    isHr: user.role === 'HR_ADMIN' && effectiveRole === 'HR_ADMIN',
    employeeId: user.employee?.id ?? null,
    userName: user.employee?.fullName ?? user.email,
  }
}

export interface DraftDetails {
  purpose?: string | null
  bankName?: string | null
  destinationCountry?: string | null
  travelFrom?: Date | null
  travelTo?: Date | null
}

/** A template letter (every type but the employment letter) written from the record. */
export async function draftTemplateLetter(type: string, employeeId: string, details: DraftDetails): Promise<{ employeeName: string; text: LetterText } | null> {
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      fullName: true, employeeCode: true, designation: true, cnic: true, joiningDate: true, exitDate: true,
      bankName: true, bankAccount: true,
      department: { select: { name: true } },
      salary: { select: { basic: true, houseRent: true, utilities: true, food: true, fuel: true, medicalAllowance: true, otherAllowance: true } },
      payslips: { orderBy: [{ year: 'desc' }, { month: 'desc' }], take: 1, select: { grossSalary: true } },
    },
  })
  if (!emp) return null
  const s = emp.salary
  const summed = s ? s.basic + s.houseRent + s.utilities + s.food + s.fuel + s.medicalAllowance + s.otherAllowance : null
  const generated = generateLetter(
    type as LetterType,
    {
      fullName: emp.fullName,
      employeeCode: emp.employeeCode,
      designation: emp.designation ?? '',
      joiningDate: emp.joiningDate ?? new Date(),
      exitDate: emp.exitDate,
      cnic: emp.cnic,
      department: emp.department?.name ?? null,
      basicSalary: s?.basic ?? null,
      grossSalary: emp.payslips[0]?.grossSalary ?? summed ?? s?.basic ?? null,
      bankName: emp.bankName,
      bankAccount: emp.bankAccount,
    },
    { letterType: type, ...details },
    DEFAULT_SIGNATORY,
  )
  return {
    employeeName: emp.fullName,
    text: bodyToText(generated.body, { subject: letterLabel(type), signatoryName: DEFAULT_SIGNATORY.name, signatoryTitle: DEFAULT_SIGNATORY.title }),
  }
}
