'use client'

/**
 * The Pay Cycle Command Center.
 *
 * Workday's layout, card for card: a context bar naming the country, period
 * and pay group; period trending; YTD totals; an audit summary; a period
 * comparison; pending transactions; and the numbered step rail down the right
 * that turns "run payroll" into a sequence somebody can follow.
 *
 * Read-only by design. Every action is a link into the payroll screen that
 * already owns that step — this page changes nothing and replaces nothing.
 *
 * Charts are recharts, which has sat in package.json unimported until now.
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, LineChart, Line, Legend,
} from 'recharts'
import {
  AlertTriangle, ChevronRight, MoreHorizontal, Maximize2, SquareStack, Pencil,
} from 'lucide-react'
import type { CommandCenterData, Slice } from '@/lib/queries/pay-cycle-command-center'

/**
 * A categorical ramp that stays distinguishable at donut-segment size and does
 * not read as a traffic light — no earnings component is good or bad.
 */
const CATEGORICAL = [
  '#0f766e', '#0891b2', '#4f46e5', '#7c3aed', '#be185d',
  '#b45309', '#65a30d', '#0d9488', '#475569', '#a16207',
]

/** Severity is the one place colour carries meaning. */
const SEVERITY_TONE: Record<string, string> = {
  high: '#be123c',
  medium: '#d97706',
  low: '#0891b2',
}

const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString('en-PK')}`

/** 2,122,750 → "2.12M". Axis labels have no room for the full number. */
function compact(n: number): string {
  const a = Math.abs(n)
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (a >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(Math.round(n))
}

/** recharts hands a formatter `ValueType | undefined`; every series here is numeric. */
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0)

const signed = (n: number) =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString('en-PK')}`

function Card({ title, children, href, hrefLabel = 'View More' }: {
  title: string
  children: React.ReactNode
  href?: string
  hrefLabel?: string
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white flex flex-col">
      <header className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2">
        <h2 className="text-[13px] font-semibold text-slate-700">{title}</h2>
        <div className="flex items-center gap-1 text-slate-300">
          <Maximize2 className="w-3.5 h-3.5" aria-hidden />
          <MoreHorizontal className="w-3.5 h-3.5" aria-hidden />
        </div>
      </header>
      <div className="px-4 pb-3 flex-1">{children}</div>
      {href && (
        <div className="border-t border-slate-100 py-2 text-center">
          <Link href={href} className="text-[11px] font-medium text-cyan-700 hover:underline">
            {hrefLabel}
          </Link>
        </div>
      )}
    </section>
  )
}

/** The donut with its total in the hole, which is the shape Workday uses. */
function Donut({ slices, centre, caption, money }: {
  slices: Slice[]
  centre: string
  caption: string
  money?: boolean
}) {
  if (slices.length === 0) {
    return <p className="text-xs text-slate-400 py-12 text-center">Nothing pending.</p>
  }
  return (
    <div>
      <div className="relative h-[188px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices} dataKey="value" nameKey="name"
              innerRadius={54} outerRadius={82} paddingAngle={1}
              stroke="none" isAnimationActive={false}
            >
              {slices.map((s, i) => (
                <Cell key={s.name} fill={CATEGORICAL[i % CATEGORICAL.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v: unknown, n: unknown) => [money ? pkr(num(v)) : num(v), String(n)]}
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-semibold text-slate-900 tabular-nums">{centre}</span>
          <span className="text-[10px] uppercase tracking-wider text-slate-400">{caption}</span>
        </div>
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {slices.map((s, i) => (
          <li key={s.name} className="flex items-center gap-1.5 text-[10.5px] text-slate-600 min-w-0">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: CATEGORICAL[i % CATEGORICAL.length] }}
            />
            <span className="truncate">{s.name}</span>
            <span className="ml-auto tabular-nums text-slate-400 flex-shrink-0">
              {money ? compact(s.value) : s.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CommandCenterClient({ d }: { d: CommandCenterData }) {
  const router = useRouter()

  return (
    <div className="space-y-4">
      {/* ── Context bar ───────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center gap-x-6 gap-y-2 flex-wrap">
        <Ctx k="Country" v={d.context.country} />
        <Ctx k="Legal entity" v={d.context.entity} />
        <label className="flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-wider text-slate-400">Period</span>
          <select
            value={`${d.context.year}-${d.context.month}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-')
              router.push(`/dashboard/payroll/command-center?month=${m}&year=${y}`)
            }}
            className="text-[12px] font-medium text-slate-800 bg-transparent border-b border-dashed border-slate-300 focus:outline-none focus:border-cyan-600 cursor-pointer"
          >
            {d.periods.map((p) => (
              <option key={`${p.year}-${p.month}`} value={`${p.year}-${p.month}`}>{p.label}</option>
            ))}
          </select>
        </label>
        <Ctx k="Pay run group" v={d.context.payGroup} />
        <span className="ml-auto flex items-center gap-2">
          {d.context.runStatus ? (
            <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
              {d.context.runStatus.replace('_', ' ')}
            </span>
          ) : (
            <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
              No run
            </span>
          )}
          <Link href="/dashboard/payroll/configuration" title="Payroll configuration">
            <Pencil className="w-3.5 h-3.5 text-slate-300 hover:text-slate-500" />
          </Link>
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 items-start">
        {/* ── Column 1 ────────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <Card title="Period Trending" href="/dashboard/payroll/slips" hrefLabel="View all payslips">
            <div className="h-[172px] -ml-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={d.trending} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tickFormatter={compact} tick={{ fontSize: 10, fill: '#94a3b8' }}
                    axisLine={false} tickLine={false} width={44}
                  />
                  <Tooltip
                    formatter={(v: unknown, n: unknown) => [pkr(num(v)), String(n)]}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={7} />
                  <Line dataKey="gross" name="Gross" stroke="#0f766e" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                  <Line dataKey="net" name="Net" stroke="#0891b2" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto mt-2">
              <table className="min-w-full text-[11px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <thead className="text-slate-400">
                  <tr>
                    <th className="text-left font-medium py-1 pr-2">Period</th>
                    <th className="text-right font-medium py-1 pr-2">Gross</th>
                    <th className="text-right font-medium py-1 pr-2">Net</th>
                    <th className="text-right font-medium py-1">Slips</th>
                  </tr>
                </thead>
                <tbody>
                  {[...d.trending].reverse().map((p) => (
                    <tr key={`${p.year}-${p.month}`} className="border-t border-slate-100">
                      <td className="py-1 pr-2 text-slate-700 whitespace-nowrap">
                        {p.label}
                        <span className="text-slate-400"> · {p.status.replace('_', ' ').toLowerCase()}</span>
                      </td>
                      <td className="py-1 pr-2 text-right text-slate-600">{Math.round(p.gross).toLocaleString('en-PK')}</td>
                      <td className="py-1 pr-2 text-right text-slate-900 font-medium">{Math.round(p.net).toLocaleString('en-PK')}</td>
                      <td className="py-1 text-right text-slate-500">{p.slips}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card
            title="Compare Periods"
            href="/dashboard/payroll/register"
            hrefLabel="Open the slip register"
          >
            {d.compare.rows.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                No prior period to compare against.
              </p>
            ) : (
              <>
                <p className="text-[10.5px] text-slate-400 mb-1">
                  {d.compare.priorLabel} → {d.context.period}
                </p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-[11px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    <thead className="text-slate-400">
                      <tr>
                        <th className="text-left font-medium py-1 pr-2">Pay component</th>
                        <th className="text-right font-medium py-1 pr-2 whitespace-nowrap">Prior</th>
                        <th className="text-right font-medium py-1 pr-2 whitespace-nowrap">Selected</th>
                        <th className="text-right font-medium py-1 pr-2">Difference</th>
                        <th className="text-right font-medium py-1">% change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(['Earnings', 'Deductions', 'Totals'] as const).map((group) => {
                        const rows = d.compare.rows.filter((r) => r.group === group)
                        if (rows.length === 0) return null
                        return (
                          <FragmentGroup key={group} label={group} rows={rows} />
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        </div>

        {/* ── Column 2 ────────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <Card title={`${d.ytd.year} Payroll Totals`} href="/dashboard/payroll/register" hrefLabel="Open the slip register">
            <Donut
              slices={d.ytd.earnings}
              centre={compact(d.ytd.gross)}
              caption={`Gross ${d.ytd.year}`}
              money
            />
            <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] space-y-0.5">
              <Row k="Net paid" v={pkr(d.ytd.net)} />
              <Row k="Deductions" v={d.ytd.deductionTotal > 0 ? pkr(d.ytd.deductionTotal) : 'none'} />
              {d.ytd.deductions.length > 0 && (
                <p className="text-[10.5px] text-slate-400 pt-0.5">
                  {d.ytd.deductions.map((x) => `${x.name} ${compact(x.value)}`).join(' · ')}
                </p>
              )}
              {d.ytd.deductionTotal === 0 && (
                <p className="text-[10.5px] text-slate-400 pt-0.5">
                  No income tax, EOBI, provident fund or healthcare has been withheld on any
                  payslip this year.
                </p>
              )}
              {d.ytd.netAboveGross > 0 && (
                <p className="text-[10.5px] text-amber-700 pt-1 flex gap-1.5">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-px" />
                  <span>
                    {d.ytd.netAboveGross} payslip{d.ytd.netAboveGross === 1 ? '' : 's'} pay
                    {d.ytd.netAboveGross === 1 ? 's' : ''} more than {d.ytd.netAboveGross === 1 ? 'its' : 'their'} own
                    gross — a hand-edited net that gross was never brought up to. That is why
                    net reads higher than gross above.
                  </span>
                </p>
              )}
            </div>
          </Card>

          <Card title="Audit Summary" href="/dashboard/payroll" hrefLabel="Open the payroll run">
            <p className="text-[11px] text-slate-500">
              <span className="text-slate-900 font-semibold tabular-nums">{d.audit.exceptions}</span>
              {' '}exception{d.audit.exceptions === 1 ? '' : 's'} across{' '}
              <span className="tabular-nums">{d.audit.payslips}</span> payslips
              {d.audit.priorMonth && (
                <> · compared with {d.audit.priorMonth.month}/{d.audit.priorMonth.year}</>
              )}
            </p>
            <div className="h-[110px] mt-2 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={d.audit.bySeverity} layout="vertical"
                  margin={{ top: 4, right: 16, bottom: 0, left: 8 }}
                >
                  <CartesianGrid horizontal={false} stroke="#f1f5f9" />
                  <XAxis
                    type="number" allowDecimals={false}
                    tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                  />
                  <YAxis
                    type="category" dataKey="label" width={74}
                    tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    formatter={(v: unknown) => [`${num(v)} exception${num(v) === 1 ? '' : 's'}`, '']}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  />
                  <Bar dataKey="count" radius={[0, 3, 3, 0]} barSize={14} isAnimationActive={false}>
                    {d.audit.bySeverity.map((s) => (
                      <Cell key={s.severity} fill={SEVERITY_TONE[s.severity]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {d.audit.top.length === 0 ? (
              <p className="text-[11px] text-emerald-700 mt-1">
                Nothing flagged against the prior month.
              </p>
            ) : (
              <ul className="mt-1 space-y-1">
                {d.audit.top.map((a) => (
                  <li key={a.payslipId} className="flex gap-2 text-[11px]">
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
                      style={{ background: SEVERITY_TONE[a.severity] }}
                    />
                    <span className="min-w-0">
                      <span className="text-slate-700 font-medium">{a.employeeName}</span>
                      <span className="text-slate-500"> — {a.summary}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* ── Column 3 — the steps ────────────────────────────────────────── */}
        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
            {d.steps.map((g) => (
              <StepBlock key={g.step} group={g} />
            ))}
          </section>

          <Card title="Payroll Transactions Pending" href="/dashboard/payroll/advances" hrefLabel="Loans & advances">
            <Donut
              slices={d.pending.slices}
              centre={String(d.pending.total)}
              caption="Count"
            />
          </Card>
        </div>
      </div>
    </div>
  )
}

function StepBlock({ group }: { group: CommandCenterData['steps'][number] }) {
  return (
    <div className="px-4 py-3">
      <p className="flex items-center gap-2 text-[12px] font-semibold text-slate-700 mb-1.5">
        <SquareStack className="w-3.5 h-3.5 text-slate-400" aria-hidden />
        {group.step}
      </p>
      <ul>
        {group.tasks.map((t) => (
          <StepTaskRow key={t.label} task={t} />
        ))}
      </ul>
    </div>
  )
}

function StepTaskRow({ task }: { task: CommandCenterData['steps'][number]['tasks'][number] }) {
  const [open, setOpen] = useState(false)
  const has = (task.count ?? 0) > 0
  return (
    <li className="border-t border-slate-50 first:border-t-0">
      <div className="flex items-center gap-2 py-1.5">
        <Link
          href={task.href}
          className="text-[11.5px] text-slate-600 hover:text-cyan-700 hover:underline min-w-0 truncate"
        >
          {task.label}
        </Link>
        {has && (
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums flex-shrink-0 ${
              task.warn
                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {task.count}
          </span>
        )}
        {task.note ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="ml-auto flex-shrink-0 text-slate-300 hover:text-slate-500"
            title={open ? 'Hide names' : 'Show names'}
          >
            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-slate-200 ml-auto flex-shrink-0" aria-hidden />
        )}
      </div>
      {open && task.note && (
        <p className="text-[10.5px] text-slate-500 pb-2 pl-0.5">{task.note}</p>
      )}
    </li>
  )
}

function FragmentGroup({ label, rows }: {
  label: string
  rows: CommandCenterData['compare']['rows']
}) {
  return (
    <>
      <tr>
        <td colSpan={5} className="pt-2 pb-0.5 text-[10px] uppercase tracking-wider text-slate-400">
          {label}
        </td>
      </tr>
      {rows.map((r) => (
        <tr key={r.component} className="border-t border-slate-100">
          <td className="py-1 pr-2 text-slate-700">{r.component}</td>
          <td className="py-1 pr-2 text-right text-slate-500">{Math.round(r.prior).toLocaleString('en-PK')}</td>
          <td className="py-1 pr-2 text-right text-slate-900">{Math.round(r.selected).toLocaleString('en-PK')}</td>
          <td className={`py-1 pr-2 text-right ${r.difference > 0 ? 'text-emerald-700' : r.difference < 0 ? 'text-rose-700' : 'text-slate-400'}`}>
            {signed(r.difference)}
          </td>
          <td className="py-1 text-right text-slate-500">
            {r.pct == null ? 'new' : `${r.pct > 0 ? '+' : ''}${r.pct.toFixed(1)}%`}
          </td>
        </tr>
      ))}
    </>
  )
}

function Ctx({ k, v }: { k: string; v: string }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-[10px] uppercase tracking-wider text-slate-400">{k}</span>
      <span className="text-[12px] font-medium text-slate-800">{v}</span>
    </span>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{k}</span>
      <span className="text-slate-900 font-medium tabular-nums">{v}</span>
    </div>
  )
}
