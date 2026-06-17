import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Card } from '@/components/ui/card'
import { Users, UserCheck, Plane, CalendarDays } from 'lucide-react'
import { formatDate, getInitials } from '@/lib/utils'

const statusTone: Record<string, string> = {
  ACTIVE: 'bg-slate-50 text-slate-700 border border-slate-100',
  RESIGNED: 'bg-slate-100 text-slate-600 border border-slate-200',
  TERMINATED: 'bg-slate-50 text-slate-700 border border-slate-100',
  ON_LEAVE: 'bg-slate-50 text-slate-700 border border-slate-100',
}

const AVATAR_PALETTE = [
  'bg-slate-100 text-slate-700',
  'bg-slate-100 text-slate-700',
  'bg-slate-100 text-slate-700',
  'bg-slate-100 text-slate-700',
  'bg-slate-100 text-slate-700',
  'bg-slate-100 text-slate-700',
  'bg-slate-100 text-slate-700',
  'bg-slate-100 text-slate-700',
]
function avatarTone(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
}

async function getManagerTeamData(managerEmployeeId: string) {
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const todayEnd = new Date(todayStart)
  todayEnd.setDate(todayEnd.getDate() + 1)

  const team = await prisma.employee.findMany({
    where: {
      reportingManagerId: managerEmployeeId,
      status: 'ACTIVE',
    },
    select: {
      id: true,
      employeeCode: true,
      fullName: true,
      email: true,
      designation: true,
      employeeType: true,
      status: true,
      joiningDate: true,
      department: { select: { name: true } },
    },
    orderBy: { fullName: 'asc' },
  })

  const teamIds = team.map((t) => t.id)

  const onLeaveToday = teamIds.length
    ? await prisma.attendanceLog.count({
        where: {
          employeeId: { in: teamIds },
          date: { gte: todayStart, lt: todayEnd },
          status: 'LEAVE',
        },
      })
    : 0

  const onProbation = team.filter((t) => t.employeeType === 'PROBATION').length
  const teamSize = team.length

  let avgTenure = 0
  if (team.length > 0) {
    const totalDays = team.reduce((sum, t) => {
      const diff = today.getTime() - new Date(t.joiningDate).getTime()
      return sum + diff / (1000 * 60 * 60 * 24)
    }, 0)
    avgTenure = totalDays / team.length / 365
  }

  return { team, teamSize, onProbation, onLeaveToday, avgTenure }
}

export async function ManagerTeamView({
  managerEmployeeId,
}: {
  managerEmployeeId: string
}) {
  const { team, teamSize, onProbation, onLeaveToday, avgTenure } = await getManagerTeamData(
    managerEmployeeId
  )

  return (
    <div className="space-y-5">
      {/* KPI Cards — concise summary, no decorative banner above (page title
          comes from the module header in employees/layout.tsx) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Team Size" value={String(teamSize)} Icon={Users} color="bg-slate-50 text-slate-700" />
        <KpiCard label="On Probation" value={String(onProbation)} Icon={UserCheck} color="bg-slate-50 text-slate-700" />
        <KpiCard label="On Leave Today" value={String(onLeaveToday)} Icon={Plane} color="bg-slate-50 text-slate-700" />
        <KpiCard label="Avg Tenure" value={`${avgTenure.toFixed(1)} yrs`} Icon={CalendarDays} color="bg-slate-50 text-slate-700" />
      </div>

      {/* Team card grid — same layout language as the HR People view */}
      <Card className="rounded-xl border-slate-200 overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 bg-white flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">My Team</h3>
          <span className="text-xs text-slate-500">
            {teamSize} {teamSize === 1 ? 'report' : 'reports'}
          </span>
        </div>
        <div className="p-4 bg-slate-50/50">
          {team.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">
              <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              No direct reports yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {team.map((emp) => (
                <Link
                  key={emp.id}
                  href={`/dashboard/employees/${emp.id}`}
                  className="group bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-200 hover:shadow-md transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${avatarTone(emp.fullName)}`}>
                      {getInitials(emp.fullName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-slate-900 text-sm leading-tight truncate group-hover:text-slate-700">
                          {emp.fullName}
                        </p>
                        <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${statusTone[emp.status] ?? 'bg-slate-100 text-slate-600'}`}>
                          {emp.status === 'ACTIVE' ? 'Active' : emp.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 truncate">{emp.designation}</p>
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <span className="text-[11px] text-slate-500">
                          {emp.department?.name ?? 'No department'}
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="text-[10px] font-medium text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">
                          {emp.employeeType === 'PERMANENT' ? 'Permanent' : emp.employeeType === 'PROBATION' ? 'Probation' : emp.employeeType === 'INTERNSHIP' ? 'Intern' : emp.employeeType === 'TRAINING' ? 'Training' : emp.employeeType}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2">Joined {formatDate(emp.joiningDate)}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

function KpiCard({
  label,
  value,
  Icon,
  color,
}: {
  label: string
  value: string
  Icon: React.ComponentType<{ className?: string }>
  color: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{label}</p>
          <p className="text-lg font-bold text-slate-900 mt-1.5">{value}</p>
        </div>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  )
}
