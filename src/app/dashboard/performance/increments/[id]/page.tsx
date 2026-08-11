/**
 * One person's pay history, with the reasoning attached.
 *
 * The Increments table answers "who is due" across everyone; this answers
 * "what happened to this person and why". Every raise carries the reason it
 * was given and any note that went with it — a percentage on its own is a
 * number nobody can defend in a review conversation.
 */

import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ArrowLeft, TrendingUp } from 'lucide-react'

const pkr = (n: number) => 'PKR ' + Math.round(n).toLocaleString('en-PK')

const day = (d: Date | null) =>
  d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const TYPE_TONE: Record<string, string> = {
  INCREMENT: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  PROMOTION: 'bg-violet-50 text-violet-800 border-violet-200',
  BONUS: 'bg-sky-50 text-sky-800 border-sky-200',
  ADJUSTMENT: 'bg-amber-50 text-amber-800 border-amber-200',
  HIRE: 'bg-slate-100 text-slate-700 border-slate-200',
}

function monthsBetween(a: Date, b: Date) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
}

export default async function IncrementDetailPage({ params }: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')
  const role = cookieStore.get('hr_preview_role')?.value ?? payload.role
  if (role !== 'HR_ADMIN' && role !== 'EXECUTIVE') redirect('/dashboard/performance')

  const employee = await prisma.employee.findUnique({
    where: { id },
    select: {
      id: true, fullName: true, employeeCode: true, designation: true,
      joiningDate: true, status: true,
      department: { select: { name: true } },
      salary: {
        select: {
          basic: true, houseRent: true, utilities: true, food: true,
          fuel: true, medicalAllowance: true, otherAllowance: true,
          effectiveFrom: true,
        },
      },
    },
  })
  if (!employee) notFound()

  const history = await prisma.compensationHistory.findMany({
    where: { employeeId: id },
    orderBy: { effectiveDate: 'desc' },
    select: {
      id: true, type: true, oldSalary: true, newSalary: true, incrementPct: true,
      reason: true, notes: true, effectiveDate: true,
    },
  })

  const s = employee.salary
  const current = s
    ? s.basic + s.houseRent + s.utilities + s.food + s.fuel + s.medicalAllowance + s.otherAllowance
    : 0

  const raises = history.filter((h) => h.newSalary > h.oldSalary)
  const totalRise = raises.reduce((n, h) => n + (h.newSalary - h.oldSalary), 0)
  const first = history[history.length - 1] ?? null
  const latest = history[0] ?? null
  const today = new Date()

  // The figure the components add up to, against what the last event recorded.
  // These are two separate stores and nothing keeps them in step, so when they
  // disagree it is worth saying so rather than showing one and hoping.
  const drift = latest ? Math.round(current - latest.newSalary) : 0

  return (
    <div className="space-y-4">
      <Link
        href="/dashboard/performance/increments"
        className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> All increments
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">{employee.fullName}</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {employee.designation ?? employee.employeeCode}
          {employee.department?.name ? ` · ${employee.department.name}` : ''}
          {' · joined '}{day(employee.joiningDate)}
          {employee.status !== 'ACTIVE' ? ` · ${employee.status.toLowerCase()}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Current pay" value={current ? pkr(current) : '—'} sub="gross, per month" />
        <Stat
          label="Raises"
          value={String(raises.length)}
          sub={raises.length ? `worth ${pkr(totalRise)} in total` : 'none recorded'}
        />
        <Stat
          label="Since joining"
          value={first && first.oldSalary > 0
            ? `+${Math.round(((current - first.oldSalary) / first.oldSalary) * 100)}%`
            : '—'}
          sub={first ? `from ${pkr(first.oldSalary || first.newSalary)}` : 'no starting figure'}
        />
        <Stat
          label="Last change"
          value={latest ? day(latest.effectiveDate) : '—'}
          sub={latest ? `${monthsBetween(latest.effectiveDate, today)} months ago` : 'nothing on record'}
        />
      </div>

      {drift !== 0 && latest && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
          The pay components on file add up to <strong>{pkr(current)}</strong>, but the most
          recent entry here records <strong>{pkr(latest.newSalary)}</strong> — a difference of{' '}
          {pkr(Math.abs(drift))}. Pay components and compensation history are stored separately
          and editing one does not update the other, so one of them is out of date.
        </p>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-slate-500" />
            Pay history · {history.length}
          </h2>
        </div>

        {history.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-12">
            Nothing recorded yet. A raise added from Compensation shows here with its reason.
          </p>
        ) : (
          <ol className="divide-y divide-slate-50">
            {history.map((h) => {
              const rise = h.newSalary - h.oldSalary
              const pct = h.incrementPct
                ?? (h.oldSalary > 0 ? (rise / h.oldSalary) * 100 : null)
              return (
                <li key={h.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-900 flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{day(h.effectiveDate)}</span>
                        <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                          TYPE_TONE[h.type] ?? TYPE_TONE.ADJUSTMENT
                        }`}>{h.type}</span>
                      </p>
                      {h.reason && <p className="text-sm text-slate-700 mt-1 max-w-3xl">{h.reason}</p>}
                      {h.notes && <p className="text-[11px] text-slate-500 mt-1 max-w-3xl">{h.notes}</p>}
                      {!h.reason && !h.notes && (
                        <p className="text-[11px] text-slate-400 mt-1">No reason recorded.</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0 tabular-nums">
                      <p className="text-sm text-slate-900">
                        {h.oldSalary ? <span className="text-slate-400">{pkr(h.oldSalary)} → </span> : null}
                        <span className="font-semibold">{pkr(h.newSalary)}</span>
                      </p>
                      {rise !== 0 && (
                        <p className={`text-[11px] mt-0.5 ${rise > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
                          {rise > 0 ? '+' : ''}{pkr(rise)}
                          {pct != null ? ` · ${pct.toFixed(1)}%` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>

      {s && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">
              What that is made of
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Effective {day(s.effectiveFrom)} — the split payroll actually uses.
            </p>
          </div>
          <div className="divide-y divide-slate-50">
            {([
              ['Basic', s.basic], ['House rent', s.houseRent], ['Utilities', s.utilities],
              ['Food', s.food], ['Fuel', s.fuel], ['Medical', s.medicalAllowance],
              ['Other allowances', s.otherAllowance],
            ] as Array<[string, number]>).map(([label, v]) => (
              <div key={label} className="px-4 py-2 flex items-center justify-between text-sm">
                <span className="text-slate-600">{label}</span>
                <span className={`tabular-nums ${v ? 'text-slate-900' : 'text-slate-300'}`}>
                  {v ? pkr(v) : '—'}
                </span>
              </div>
            ))}
            <div className="px-4 py-2 flex items-center justify-between text-sm bg-slate-50 font-semibold">
              <span className="text-slate-900">Gross monthly</span>
              <span className="tabular-nums text-slate-900">{pkr(current)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-900 mt-1 tabular-nums">{value}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
    </div>
  )
}
