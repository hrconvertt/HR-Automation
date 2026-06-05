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
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
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

  async function handleDownload() {
    const res = await fetch(`/api/employees/${employeeId}/total-rewards`)
    if (!res.ok) {
      alert('Could not generate Total Rewards statement.')
      return
    }
    const blob = await res.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `total-rewards-${employeeName.replace(/\s+/g, '-')}.html`
    a.click()
    window.URL.revokeObjectURL(url)
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
          {access.canEdit && (
            <Button size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" />
              {currentSalary ? 'Request Compensation Change' : 'Set Initial Salary'}
            </Button>
          )}
        </div>
      </div>

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

      {/* ─── History timeline ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="w-4 h-4 text-slate-500" /> Compensation History
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {history.length === 0 ? (
            <p className="text-sm text-slate-400 italic py-8 text-center">
              No compensation changes recorded.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Effective</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Previous</TableHead>
                  <TableHead className="text-right">New</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((c) => {
                  const meta = TYPE_LABELS[c.type] ?? { label: c.type, tone: 'bg-slate-100 text-slate-700' }
                  const diff = c.newSalary - c.oldSalary
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium tabular-nums">{fmtDate(c.effectiveDate)}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.tone}`}>
                          {meta.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-slate-600 tabular-nums">
                        {c.oldSalary > 0 ? formatCurrency(c.oldSalary) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-slate-900 tabular-nums">
                        {formatCurrency(c.newSalary)}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums font-medium ${diff >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {diff > 0 ? '+' : ''}{formatCurrency(diff)}
                        {c.incrementPct != null && (
                          <span className="block text-[10px] font-normal text-slate-500">
                            {c.incrementPct > 0 ? '+' : ''}{c.incrementPct.toFixed(1)}%
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-600 text-sm max-w-[220px]">
                        {c.reason ?? <span className="text-slate-300 italic">—</span>}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
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
