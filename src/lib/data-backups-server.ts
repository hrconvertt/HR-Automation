/**
 * Who may open Settings → Data backups: HR and executives. Every salary,
 * CNIC and disciplinary record is in these files, so nobody else.
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function resolveBackupActor(): Promise<{ role: string; name: string } | NextResponse> {
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const role = payload.role === 'HR_ADMIN' ? (cookieStore.get('hr_preview_role')?.value ?? payload.role) : payload.role
  if (role !== 'HR_ADMIN' && role !== 'EXECUTIVE') {
    return NextResponse.json({ error: 'Only HR and executives can open data backups.' }, { status: 403 })
  }
  const emp = payload.employeeId
    ? await prisma.employee.findUnique({ where: { id: payload.employeeId }, select: { fullName: true } })
    : null
  return { role, name: emp?.fullName ?? 'HR' }
}
