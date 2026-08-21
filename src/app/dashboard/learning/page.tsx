/**
 * Training & Development.
 *
 * Three things HR actually does: run programs, put people on them and track how
 * far they got, and keep a register of the certifications people hold — with an
 * eye on the ones about to expire. Read here on the server; the doing is in the
 * client.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { LearningClient } from './learning-client'

export default async function LearningPage() {
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')
  const role = cookieStore.get('hr_preview_role')?.value ?? payload.role
  const isHR = role === 'HR_ADMIN'

  const [programs, records, certs, staff] = await Promise.all([
    prisma.trainingProgram.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { records: true } } },
    }),
    prisma.trainingRecord.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        employee: { select: { fullName: true, employeeCode: true } },
        program: { select: { title: true, type: true } },
      },
    }),
    prisma.certification.findMany({ orderBy: [{ expiryDate: 'asc' }, { createdAt: 'desc' }] }),
    prisma.employee.findMany({
      where: { deletedAt: null, status: { notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE', 'LAYOFF'] } },
      select: { id: true, fullName: true, employeeCode: true },
      orderBy: { fullName: 'asc' },
    }),
  ])

  // Certifications carry only employeeId, so resolve names here.
  const nameById = new Map(staff.map((s) => [s.id, s.fullName]))

  return (
    <LearningClient
      isHR={isHR}
      staff={staff}
      programs={programs.map((p) => ({
        id: p.id, title: p.title, type: p.type, provider: p.provider,
        description: p.description, duration: p.duration, cost: p.cost,
        enrolled: p._count.records,
      }))}
      records={records.map((r) => ({
        id: r.id,
        employeeName: r.employee.fullName,
        employeeCode: r.employee.employeeCode,
        programTitle: r.program.title,
        programType: r.program.type,
        status: r.status,
        score: r.score,
        startDate: r.startDate.toISOString(),
        endDate: r.endDate?.toISOString() ?? null,
      }))}
      certs={certs.map((c) => ({
        id: c.id,
        employeeName: nameById.get(c.employeeId) ?? 'Unknown',
        name: c.name,
        issuedBy: c.issuedBy,
        issuedDate: c.issuedDate.toISOString(),
        expiryDate: c.expiryDate?.toISOString() ?? null,
        credentialUrl: c.credentialUrl,
      }))}
    />
  )
}
