/**
 * Appraisal Forms — whose review is due, and why now.
 *
 * Two cohorts, one list, because from HR's side they are the same job: a form
 * to fill in before a date that is already fixed.
 *
 *   On probation   ten days before probation ends
 *   Permanent      ten days before the month their increment falls in
 *
 * Ten days is the existing REVIEW_WINDOW_DAYS — the probation flow already
 * used it, and having appraisals open on a different number would mean two
 * answers to "is this due yet".
 *
 * Nothing is generated on a schedule. The form opens when somebody opens it;
 * this page is what tells them to.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isFounder } from '@/lib/review-scope'
import { REVIEW_WINDOW_DAYS } from '@/lib/probation-review'
import { INCREMENT_RULES, ruleRange } from '@/lib/pay-split'
import { incrementDue as nextIncrementDue, daysAway, FIRST_REVIEW_MONTHS } from '@/lib/increment-schedule'
import { ClipboardList, ShieldCheck, TrendingUp } from 'lucide-react'
import { OpenAppraisal } from './_components/open-appraisal'

const pkr = (n: number) => 'PKR ' + Math.round(n).toLocaleString('en-PK')

const day = (d: Date | null) =>
  d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

interface Due {
  employeeId: string
  fullName: string
  designation: string | null
  department: string | null
  kind: 'PROBATION' | 'INCREMENT'
  /** The date the form is written against. */
  dueDate: Date
  daysLeft: number
  currentPay: number
  band: string
  detail: string
  href: string
  hasForm: boolean
  /** An appraisal form already opened for this person, if there is one. */
  appraisalId: string | null
}

export default async function AppraisalsPage() {
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')
  const role = cookieStore.get('hr_preview_role')?.value ?? payload.role
  if (role !== 'HR_ADMIN' && role !== 'EXECUTIVE' && role !== 'MANAGER') {
    redirect('/dashboard/performance')
  }

  const [probations, employees, history, existingReviews, appraisalForms] = await Promise.all([
    prisma.probationRecord.findMany({
      where: { status: { in: ['ACTIVE', 'UNDER_REVIEW'] } },
      select: {
        id: true, employeeId: true, endDate: true, status: true,
        employee: {
          select: {
            fullName: true, designation: true, status: true,
            department: { select: { name: true } },
            salary: {
              select: {
                basic: true, houseRent: true, utilities: true, food: true,
                fuel: true, medicalAllowance: true, otherAllowance: true,
              },
            },
          },
        },
      },
    }),
    prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true, fullName: true, designation: true, joiningDate: true,
        incrementTrack: true,
        department: { select: { name: true } },
        salary: {
          select: {
            basic: true, houseRent: true, utilities: true, food: true,
            fuel: true, medicalAllowance: true, otherAllowance: true,
          },
        },
      },
    }),
    prisma.compensationHistory.findMany({
      where: { type: { in: ['INCREMENT', 'PROMOTION'] } },
      orderBy: { effectiveDate: 'desc' },
      select: { employeeId: true, effectiveDate: true },
    }),
    prisma.probationReview.findMany({ select: { employeeId: true } }),
    // The most recent appraisal form per person, so a row offers "open" rather
    // than starting a second one.
    prisma.appraisalForm.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, employeeId: true, status: true },
    }),
  ])

  const reviewed = new Set(existingReviews.map((r) => r.employeeId))
  const appraisalByEmployee = new Map<string, string>()
  for (const a of appraisalForms) {
    if (!appraisalByEmployee.has(a.employeeId)) appraisalByEmployee.set(a.employeeId, a.id)
  }
  const onProbation = new Set(probations.map((p) => p.employeeId))
  const lastRaise = new Map<string, Date>()
  for (const h of history) {
    if (!lastRaise.has(h.employeeId)) lastRaise.set(h.employeeId, h.effectiveDate)
  }

  const gross = (s: { basic: number; houseRent: number; utilities: number; food: number
    fuel: number; medicalAllowance: number; otherAllowance: number } | null) =>
    s ? s.basic + s.houseRent + s.utilities + s.food + s.fuel + s.medicalAllowance + s.otherAllowance : 0

  const due: Due[] = []

  // ── On probation ──────────────────────────────────────────────────────
  for (const p of probations) {
    if (p.employee.status !== 'ACTIVE') continue
    if (isFounder(p.employee.designation)) continue
    const left = daysAway(p.endDate)
    if (left > REVIEW_WINDOW_DAYS) continue
    due.push({
      employeeId: p.employeeId,
      fullName: p.employee.fullName,
      designation: p.employee.designation,
      department: p.employee.department?.name ?? null,
      kind: 'PROBATION',
      dueDate: p.endDate,
      daysLeft: left,
      currentPay: gross(p.employee.salary),
      band: ruleRange('PROBATION_TO_PERMANENT'),
      detail: left < 0
        ? `Probation ended ${plural(Math.abs(left), 'day')} ago`
        : `Probation ends in ${plural(left, 'day')}`,
      href: `/dashboard/probation/${p.id}`,
      hasForm: reviewed.has(p.employeeId),
      appraisalId: appraisalByEmployee.get(p.employeeId) ?? null,
    })
  }

  // ── Permanent, on the increment clock ─────────────────────────────────
  for (const e of employees) {
    if (onProbation.has(e.id)) continue
    if (isFounder(e.designation)) continue
    // Same maths as the increments tab, from the same place — see
    // src/lib/increment-schedule.ts.
    const { track, dueDate, neverRaised } = nextIncrementDue({
      incrementTrack: e.incrementTrack,
      lastIncrement: lastRaise.get(e.id) ?? null,
      joiningDate: e.joiningDate,
    })
    if (!dueDate) continue
    const left = daysAway(dueDate)
    if (left > REVIEW_WINDOW_DAYS) continue
    due.push({
      employeeId: e.id,
      fullName: e.fullName,
      designation: e.designation,
      department: e.department?.name ?? null,
      kind: 'INCREMENT',
      dueDate,
      daysLeft: left,
      currentPay: gross(e.salary),
      // The band the person's own track earns, not the annual one for
      // everybody — 24% against a six-monthly reviewer is a wrong number to
      // walk into a review with.
      band: ruleRange(track),
      detail: (left < 0
        ? `Increment was due ${plural(Math.abs(left), 'day')} ago`
        : `Increment month starts in ${plural(left, 'day')}`)
        + ` · ${INCREMENT_RULES[track].label.toLowerCase()}`
        + (neverRaised ? ', first review' : ''),
      href: `/dashboard/performance/increments/${e.id}`,
      hasForm: appraisalByEmployee.has(e.id),
      appraisalId: appraisalByEmployee.get(e.id) ?? null,
    })
  }

  due.sort((a, b) => a.daysLeft - b.daysLeft)
  const overdue = due.filter((d) => d.daysLeft < 0)
  const probationDue = due.filter((d) => d.kind === 'PROBATION')
  const incrementDue = due.filter((d) => d.kind === 'INCREMENT')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Appraisal Forms</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Reviews that fall due within {REVIEW_WINDOW_DAYS} days — before probation ends, and
          before an increment month starts.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Due now" value={String(due.length)} sub={`within ${REVIEW_WINDOW_DAYS} days`} />
        <Stat label="Overdue" value={String(overdue.length)} sub="date already passed" />
        <Stat label="Probation" value={String(probationDue.length)} sub={`confirmation at ${ruleRange('PROBATION_TO_PERMANENT')}`} />
        <Stat label="Increment" value={String(incrementDue.length)} sub="on their own track" />
      </div>

      {due.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-12 border border-slate-200 rounded-xl bg-white">
          Nothing due in the next {REVIEW_WINDOW_DAYS} days. Forms appear here on their own as
          dates come round — probation ends and increment months are both already known.
        </p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Waiting on a form · {due.length}</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Soonest first. The band is the starting figure for that kind of review, not a cap.
            </p>
          </div>
          <div className="divide-y divide-slate-50">
            {due.map((d) => {
              const late = d.daysLeft < 0
              return (
                <div key={`${d.kind}-${d.employeeId}`} className="px-4 py-3 flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-900 flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{d.fullName}</span>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                        d.kind === 'PROBATION'
                          ? 'bg-violet-50 text-violet-800 border-violet-200'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      }`}>
                        {d.kind === 'PROBATION'
                          ? <ShieldCheck className="w-2.5 h-2.5" />
                          : <TrendingUp className="w-2.5 h-2.5" />}
                        {d.kind === 'PROBATION' ? 'Probation' : 'Increment'}
                      </span>
                      {d.hasForm && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border bg-slate-100 text-slate-600 border-slate-200">
                          Started
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {d.designation ?? '—'}{d.department ? ` · ${d.department}` : ''}
                    </p>
                    <p className={`text-[11px] mt-1 ${late ? 'text-amber-800 font-medium' : 'text-slate-500'}`}>
                      {d.detail} · {day(d.dueDate)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-sm text-slate-900 tabular-nums">
                        {d.currentPay ? pkr(d.currentPay) : <span className="text-slate-400">pay not set</span>}
                      </p>
                      <p className="text-[11px] text-slate-400">band {d.band}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={d.href}
                        className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                      >
                        <ClipboardList className="w-3 h-3" />
                        {d.kind === 'PROBATION' ? 'Probation record' : 'Pay history'}
                      </Link>
                      <OpenAppraisal employeeId={d.employeeId} existingFormId={d.appraisalId} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <h2 className="text-sm font-semibold text-slate-900">How the dates are worked out</h2>
        <ul className="mt-2 space-y-1.5 text-[12px] text-slate-600">
          <li>
            <strong className="text-slate-900">On probation</strong> — the form opens{' '}
            {REVIEW_WINDOW_DAYS} days before the probation end date on their record.
            Confirmation carries {ruleRange('PROBATION_TO_PERMANENT')}, which is the
            company&apos;s call rather than automatic.
          </li>
          <li>
            <strong className="text-slate-900">Permanent</strong> — {REVIEW_WINDOW_DAYS} days
            before the increment falls due: six months after the last raise on the six-monthly
            track and twelve on the annual one, or {FIRST_REVIEW_MONTHS} months after joining
            for anyone who has not had one yet. The band shown on each row is that person&apos;s
            own — {ruleRange('BIANNUAL')} six-monthly, {ruleRange('ANNUAL')} annual.
          </li>
        </ul>
      </div>
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
