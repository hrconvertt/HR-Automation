import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getDailyLoggingConfig } from '@/lib/daily-logging-config'
import DailyLoggingSettingsClient from './daily-logging-client'

export default async function DailyLoggingSettingsPage() {
  const payload = await verifyToken()
  if (!payload) redirect('/login')
  if (payload.role !== 'HR_ADMIN') {
    return (
      <div className="p-6 bg-slate-50 border border-slate-100 rounded-xl">
        <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="text-sm text-slate-700 mt-2">HR only.</p>
      </div>
    )
  }

  const [positions, employees, config] = await Promise.all([
    prisma.position.findMany({
      where: { active: true },
      orderBy: [{ title: 'asc' }],
      select: { id: true, title: true },
    }),
    prisma.employee.findMany({
      where: { status: { notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE'] } },
      orderBy: [{ fullName: 'asc' }],
      select: { id: true, fullName: true, designation: true },
    }),
    getDailyLoggingConfig(),
  ])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Daily Logging Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure the KPI library, per-employee assignments, and the rules driving
          the daily log + Ask Why workflow. Every setting on this page is read by
          the system at runtime — nothing is hardcoded.
        </p>
      </div>
      <DailyLoggingSettingsClient
        positions={positions}
        employees={employees}
        initialConfig={config}
      />
    </div>
  )
}
