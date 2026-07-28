import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ArrowLeft, Shield } from 'lucide-react'
import LocationsManager from '@/components/attendance/locations-manager'
import TrustedDevicesPanel from '@/components/attendance/trusted-devices-panel'

export default async function AttendanceSecurityPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({ where: { id: payload.userId } })
  if (!user || user.role !== 'HR_ADMIN') {
    return (
      <div className="p-6 bg-slate-50 border border-slate-100 rounded-2xl">
        <h2 className="text-lg font-semibold text-slate-900">HR-only area</h2>
        <p className="text-sm text-slate-900 mt-2">Only HR can manage clock-in security.</p>
      </div>
    )
  }

  const [locations, devices] = await Promise.all([
    prisma.location.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.trustedDevice.findMany({
      include: { employee: { select: { fullName: true, employeeCode: true } } },
      orderBy: [{ status: 'asc' }, { lastUsedAt: 'desc' }],
    }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/attendance"
            className="inline-flex items-center gap-1 text-sm text-slate-700 hover:underline mb-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Attendance
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-slate-700" />
            Clock-in Security
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage trusted devices and (optional) WiFi networks used to verify clock-ins.
          </p>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm text-slate-900">
        <p className="font-semibold mb-1">How clock-in security works</p>
        <p>
          Each employee's laptop/phone is registered as a <strong>Trusted Device</strong> the first
          time they clock in. After HR approves it, every subsequent clock-in from that device is
          accepted silently. Clock-ins from <strong>unknown devices are blocked</strong>, preventing
          buddy-punching. The mobile app can also verify <strong>office WiFi</strong> for extra
          confidence.
        </p>
      </div>

      <LocationsManager initial={locations.map(l => ({
        id: l.id,
        name: l.name,
        kind: l.kind,
        ipCidrs: l.ipCidrs,
        ssids: l.ssids,
        lat: l.lat,
        lng: l.lng,
        radiusMeters: l.radiusMeters,
        notes: l.notes,
        active: l.active,
      }))} />

      <TrustedDevicesPanel initial={devices.map(d => ({
        id: d.id,
        employeeName: d.employee.fullName,
        employeeCode: d.employee.employeeCode,
        deviceHash: d.deviceHash,
        label: d.label,
        userAgent: d.userAgent,
        status: d.status,
        firstSeenAt: d.firstSeenAt.toISOString(),
        lastUsedAt: d.lastUsedAt.toISOString(),
      }))} />
    </div>
  )
}
