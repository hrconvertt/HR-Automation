import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Badge } from '@/components/ui/badge'
import { ShieldCheck } from 'lucide-react'
import { ProbationTrackerTabs, type ProbationListItem } from '@/components/probation/tracker-tabs'

const STATUSES = ['ACTIVE', 'UNDER_REVIEW', 'CONFIRMED', 'EXTENDED', 'WARNED', 'TERMINATED'] as const

const STATUS_TONE: { [key: string]: string } = {
  ACTIVE: 'bg-blue-50 text-blue-700 border-blue-200',
  UNDER_REVIEW: 'bg-amber-50 text-amber-700 border-amber-200',
  CONFIRMED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  EXTENDED: 'bg-violet-50 text-violet-700 border-violet-200',
  WARNED: 'bg-orange-50 text-orange-700 border-orange-200',
  TERMINATED: 'bg-rose-50 text-rose-700 border-rose-200',
}

export default async function ProbationListPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
  const payload = verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  if (!user) redirect('/login')

  const previewRole =
    user.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role
  const meId = user.employee?.id ?? null

  let where: object = {}
  if (effectiveRole === 'MANAGER' && meId) {
    where = { employee: { reportingManagerId: meId } }
  } else if (effectiveRole === 'EMPLOYEE') {
    if (!meId) {
      // No employee link → no records visible
      where = { id: '__none__' }
    } else {
      where = { employeeId: meId }
    }
  } else if (effectiveRole !== 'HR_ADMIN') {
    where = { id: '__none__' }
  }

  const recordsRaw = await prisma.probationRecord.findMany({
    where,
    orderBy: { endDate: 'asc' },
    include: {
      employee: {
        select: {
          id: true, fullName: true, employeeCode: true, designation: true,
          department: { select: { name: true } },
          reportingManager: { select: { id: true, fullName: true } },
        },
      },
    },
  })

  // Serialize Date fields to ISO strings for the client component prop
  const records: ProbationListItem[] = recordsRaw.map((r) => ({
    id: r.id,
    status: r.status,
    startDate: r.startDate.toISOString(),
    endDate: r.endDate.toISOString(),
    durationMonths: r.durationMonths,
    warningCount: r.warningCount,
    employee: {
      id: r.employee.id,
      fullName: r.employee.fullName,
      employeeCode: r.employee.employeeCode,
      designation: r.employee.designation,
      department: r.employee.department,
      reportingManager: r.employee.reportingManager,
    },
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-600 p-6 text-white shadow-md">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-white/15 p-3 backdrop-blur">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">Probation Tracker</h1>
            <p className="text-white/85 mt-1 text-sm">
              Full lifecycle: settling check-in, decision packet, manager + HR review, outcome enactment.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs (client) */}
      <ProbationTrackerTabs records={records} />

      <p className="text-xs text-slate-400">
        Status badges:{' '}
        {STATUSES.map((s) => (
          <Badge key={s} variant="outline" className={`mr-1 ${STATUS_TONE[s]}`}>{s}</Badge>
        ))}
      </p>
    </div>
  )
}
