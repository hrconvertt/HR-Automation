'use client'

/**
 * Compensation panel — clean section grouping, KPI tiles,
 * pay-component breakdown, history timeline, and a Total Rewards download.
 *
 * Access tiers (enforced server-side too):
 *   canEdit       → Edit Salary button visible (HR_ADMIN only)
 *   canDownload   → Total Rewards button visible (HR / EXEC / FINANCE / MGR-of-team / self)
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Wallet, TrendingUp, Calendar, Lock,
  Download, Pencil, Eye, ShieldCheck,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import EditSalaryDialog from './edit-salary-dialog'

type Salary = {
  basic: number
  houseRent: number
  utilities: number
  food: number
  fuel: number
  medicalAllowance: number
  otherAllowance: number
  effectiveFrom?: Date | string
}

type HistoryRow = {
  id: string
  effectiveDate: string
  type: string
  oldSalary: number
  newSalary: number
  incrementPct: number | null
  reason: string | null
}

type Access = {
  canEdit: boolean
  canDownload: boolean
  viewerRole: string
}

const TYPE_LABELS: Record<string, { label: string; tone: string }> = {
  INCREMENT:   { label: 'Annual Increment', tone: 'bg-emerald-100 text-emerald-800' },
  PROMOTION:   { label: 'Promotion',         tone: 'bg-blue-100 text-blue-800' },
  BONUS:       { label: 'Bonus',             tone: 'bg-purple-100 text-purple-800' },
  ADJUSTMENT:  { label: 'Adjustment',        tone: 'bg-amber-100 text-amber-800' },
  INITIAL:     { label: 'Initial Setup',     tone: 'bg-slate-100 text-slate-700' },
}

function fmtDate(s: string | Date) {
  return new Date(s).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export default function CompensationPanel({
  employeeId, employeeName, currentSalary, history, access,
}: {
  employeeId: string
  employeeName: string
  currentSalary: Salary | null
  history: HistoryRow[]
  access: Access
}) {
  const [editOpen, setEditOpen] = useState(false)

  const grossMonthly = currentSalary
    ? currentSalary.basic + currentSalary.houseRent + currentSalary.utilities +
      currentSalary.food + currentSalary.fuel + currentSalary.medicalAllowance +
      currentSalary.otherAllowance
    : 0

  const annualGross = grossMonthly * 12
  const latestChange = history[0] // history is ordered desc by effectiveDate
  const ytdChanges = history.filter((h) =>
    new Date(h.effectiveDate).getFullYear() === new Date().getFullYear(),
  ).length

  function handleDownload() {
    // Opens the printable A4 Total Rewards page in a new tab; that page
    // auto-fires window.print() so HR/employee can save it as PDF.
    window.open(`/dashboard/employees/${employeeId}/total-rewards`, '_blank', 'noopener')
  }

  return (
    <div className="space-y-5">

      {/* ─── Access banner ────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <ShieldCheck className="w-4 h-4 text-slate-400" />
          <span>
            <strong className="text-slate-900">Confidential.</strong>{' '}
            You are viewing this as{' '}
            <span className="font-semibold text-slate-700">{access.viewerRole}</span>
            {!access.canEdit && (
              <span className="text-slate-500"> · Read-only</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {access.canDownload && (
            <Button size="sm" variant="outline" onClick={handleDownload}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Total Rewards
            </Button>
          )}
          {access.canEdit && !currentSalary && (
            <Button size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" />
              Set Initial Salary
            </Button>
          )}
          {access.canEdit && currentSalary && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditOpen(true)}
              title="Override pay components — useful when payroll auto-calculation needs a mid-cycle or retroactive adjustment."
            >
              <Pencil className="w-3.5 h-3.5 mr-1.5" />
              Edit Pay Components
            </Button>
          )}
        </div>
      </div>
      {access.canEdit && currentSalary && (
        <p className="-mt-2 text-[11px] text-slate-500">
          Use <strong>Edit Pay Components</strong> when payroll auto-calculation needs override
          (e.g. mid-cycle changes, retroactive adjustments). Saves a history entry automatically.
        </p>
      )}

      {/* ─── KPI tiles ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <KpiTile
          label="Monthly Gross"
          value={currentSalary ? formatCurrency(grossMonthly) : '—'}
          sub="All earnings before tax"
          Icon={Wallet}
          tone="text-blue-600 bg-blue-50"
        />
        <KpiTile
          label="Annual Gross"
          value={currentSalary ? formatCurrency(annualGross) : '—'}
          sub="Monthly × 12"
          Icon={TrendingUp}
          tone="text-emerald-600 bg-emerald-50"
        />
        <KpiTile
          label="Last Change"
          value={latestChange ? fmtDate(latestChange.effectiveDate) : 'Never'}
          sub={latestChange ? (TYPE_LABELS[latestChange.type]?.label ?? latestChange.type) : 'No history'}
          Icon={Calendar}
          tone="text-purple-600 bg-purple-50"
        />
        <KpiTile
          label="Changes This Year"
          value={String(ytdChanges)}
          sub="Comp events in current FY"
          Icon={Lock}
          tone="text-amber-600 bg-amber-50"
        />
      </div>

      {/* ─── Pay Components ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="w-4 h-4 text-slate-500" /> Pay Components
            {currentSalary?.effectiveFrom && (
              <span className="text-[11px] font-normal text-slate-500 ml-2">
                effective {fmtDate(currentSalary.effectiveFrom)}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-5">
          {!currentSalary ? (
            <p className="text-sm text-slate-400 italic py-4 text-center">
              No salary record yet.
              {access.canEdit && ' Click "Set Initial Salary" above to create one.'}
            </p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                <PayRow label="Basic Salary"      value={currentSalary.basic} weight="primary" />
                <PayRow label="House Rent"        value={currentSalary.houseRent} />
                <PayRow label="Utilities"         value={currentSalary.utilities} />
                <PayRow label="Food Allowance"    value={currentSalary.food} />
                <PayRow label="Fuel Allowance"    value={currentSalary.fuel} />
                <PayRow label="Medical Allowance" value={currentSalary.medicalAllowance} />
                <PayRow label="Other Allowances"  value={currentSalary.otherAllowance} />
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300">
                  <td className="pt-3 pb-1 font-bold text-slate-900">Gross Monthly Pay</td>
                  <td className="pt-3 pb-1 text-right font-bold text-blue-700 tabular-nums">
                    {formatCurrency(grossMonthly)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>

      {/* ─── History timeline ─────────────────────────────────────────
          Vertical timeline (dots + connecting line) listing every
          CompensationHistory row. Pakistani culture: salary changes
          flow through review cycles, not self-serve — so this is a
          read-only chronicle, not an action surface. */}
      <Card>
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="w-4 h-4 text-slate-500" /> Compensation History
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {history.length === 0 ? (
            <p className="text-sm text-slate-400 italic py-6 text-center">
              No compensation changes recorded yet.
            </p>
          ) : (
            <>
              {/* Sorted oldest → newest for chronological reading;
                  history prop arrives newest-first. */}
              {(() => {
                const sorted = [...history].sort(
                  (a, b) => new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime(),
                )
                return (
                  <ol className="relative border-l-2 border-slate-200 ml-3 space-y-6">
                    {sorted.map((c) => {
                      const meta = TYPE_LABELS[c.type] ?? { label: c.type, tone: 'bg-slate-100 text-slate-700' }
                      const diff = c.newSalary - c.oldSalary
                      const pct =
                        c.incrementPct != null
                          ? c.incrementPct
                          : c.oldSalary > 0
                          ? ((c.newSalary - c.oldSalary) / c.oldSalary) * 100
                          : null
                      const positive = diff >= 0
                      return (
                        <li key={c.id} className="pl-6 relative">
                          <span
                            className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full ring-4 ring-white ${
                              positive ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                          />
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <span className="text-xs font-semibold text-slate-700 tabular-nums">
                              {fmtDate(c.effectiveDate)}
                            </span>
                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${meta.tone}`}>
                              {meta.label}
                            </span>
                          </div>
                          <p className="mt-1.5 text-sm text-slate-900">
                            {c.oldSalary > 0 ? (
                              <>
                                <span className="text-slate-500 tabular-nums">{formatCurrency(c.oldSalary)}</span>
                                <span className="mx-2 text-slate-400">→</span>
                                <span className="font-semibold tabular-nums">{formatCurrency(c.newSalary)}</span>
                              </>
                            ) : (
                              <span className="font-semibold tabular-nums">{formatCurrency(c.newSalary)}</span>
                            )}
                            {pct != null && c.oldSalary > 0 && (
                              <span className={`ml-2 text-xs font-medium ${positive ? 'text-emerald-700' : 'text-rose-700'}`}>
                                ({pct > 0 ? '+' : ''}{pct.toFixed(1)}%)
                              </span>
                            )}
                          </p>
                          {c.reason && (
                            <p className="mt-0.5 text-xs text-slate-600">{c.reason}</p>
                          )}
                        </li>
                      )
                    })}
                  </ol>
                )
              })()}

              {/* Total growth since joining — first → latest */}
              {(() => {
                const sorted = [...history].sort(
                  (a, b) => new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime(),
                )
                const first = sorted[0]
                const last = sorted[sorted.length - 1]
                if (!first || !last || first.id === last.id) return null
                const start = first.newSalary || first.oldSalary
                if (!start) return null
                const growth = ((last.newSalary - start) / start) * 100
                const startDate = new Date(first.effectiveDate)
                const endDate = new Date(last.effectiveDate)
                const months = Math.max(
                  1,
                  Math.round(
                    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30.4),
                  ),
                )
                return (
                  <div className="mt-6 rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 flex items-center justify-between">
                    <span className="text-xs text-slate-600">Total growth since joining</span>
                    <span className={`text-sm font-semibold ${growth >= 0 ? 'text-emerald-700' : 'text-rose-700'} tabular-nums`}>
                      {growth >= 0 ? '+' : ''}{growth.toFixed(1)}% in {months} {months === 1 ? 'month' : 'months'}
                    </span>
                  </div>
                )
              })()}
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── Read-only viewers see access notice ──────────────────── */}
      {!access.canEdit && (
        <p className="text-xs text-slate-400 text-center pt-1 flex items-center justify-center gap-1.5">
          <Eye className="w-3.5 h-3.5" />
          You can view but not edit. Only HR Admin can modify compensation.
        </p>
      )}

      {access.canEdit && (
        <EditSalaryDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          employeeId={employeeId}
          employeeName={employeeName}
          current={currentSalary}
        />
      )}
    </div>
  )
}

function KpiTile({ label, value, sub, Icon, tone }: {
  label: string; value: string; sub: string;
  Icon: React.ComponentType<{ className?: string }>; tone: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
            <p className="text-xl font-bold text-slate-900 mt-1 truncate">{value}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
          </div>
          <div className={`p-2 rounded-lg ${tone}`}>
            <Icon className="w-4 h-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function PayRow({ label, value, weight }: { label: string; value: number; weight?: 'primary' }) {
  return (
    <tr className="border-b border-slate-100">
      <td className={`py-2 ${weight === 'primary' ? 'font-medium text-slate-900' : 'text-slate-700'}`}>
        {label}
      </td>
      <td className="py-2 text-right tabular-nums text-slate-900">
        {value > 0 ? formatCurrency(value) : <span className="text-slate-300">—</span>}
      </td>
    </tr>
  )
}
