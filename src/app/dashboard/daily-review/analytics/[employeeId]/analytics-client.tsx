'use client'

import { useEffect, useState } from 'react'

interface MetricSeries {
  id: string
  name: string
  unit: string
  series: { date: string; target: number; actual: number }[]
}
interface DailyPoint { date: string; totalHours: number; sumTarget: number; sumActual: number }
interface Inquiry {
  kind: 'TASK' | 'KPI'
  id: string
  date: string
  label: string
  question: string | null
  status: string
  response: string | null
}
interface Analytics {
  range: string
  from: string
  to: string
  daily: DailyPoint[]
  metrics: MetricSeries[]
  inquiries: Inquiry[]
  inquiryCounts: { total: number; task: number; kpi: number }
}

const RANGES = [
  { v: '14d', label: '14 days' },
  { v: '30d', label: '30 days' },
  { v: '90d', label: '90 days' },
  { v: 'custom', label: 'Custom' },
]

export default function AnalyticsClient({ employeeId }: { employeeId: string }) {
  const [range, setRange] = useState('30d')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    let url = `/api/daily-log/analytics?employeeId=${employeeId}&range=${range}`
    if (range === 'custom' && from && to) url += `&from=${from}&to=${to}`
    const res = await fetch(url, { cache: 'no-store' })
    if (res.ok) setData(await res.json())
    setLoading(false)
  }
  useEffect(() => { void load() }, [range, from, to])

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center gap-2 text-sm">
        {RANGES.map((r) => (
          <button
            key={r.v}
            type="button"
            onClick={() => setRange(r.v)}
            className={`px-3 py-1 rounded text-sm font-medium ${
              range === r.v ? 'bg-slate-900 text-white' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            {r.label}
          </button>
        ))}
        {range === 'custom' && (
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-sm ml-2" />
            <span className="text-gray-500">→</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-sm" />
          </>
        )}
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {!loading && data && (
        <>
          <KpiAttainmentChart metrics={data.metrics} />
          <EfficiencyScatter daily={data.daily} />
          <InquirySection counts={data.inquiryCounts} inquiries={data.inquiries} />
        </>
      )}
    </div>
  )
}

// ── Chart 1 — KPI Attainment Trend ──────────────────────────────────────────
function KpiAttainmentChart({ metrics }: { metrics: MetricSeries[] }) {
  if (metrics.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">KPI Attainment Trend</h3>
        <p className="text-sm text-gray-500">No KPI data in this range.</p>
      </div>
    )
  }
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">KPI Attainment Trend</h3>
      <div className="space-y-6">
        {metrics.map((m) => (
          <SingleMetricChart key={m.id} metric={m} />
        ))}
      </div>
    </div>
  )
}

function SingleMetricChart({ metric }: { metric: MetricSeries }) {
  const width = 700
  const height = 140
  const padding = { top: 10, right: 10, bottom: 22, left: 30 }
  const innerW = width - padding.left - padding.right
  const innerH = height - padding.top - padding.bottom
  const pts = metric.series
  const maxY = Math.max(1, ...pts.map((p) => Math.max(p.target, p.actual)))
  const barW = pts.length > 0 ? innerW / pts.length : 0
  const targetLine = pts.length > 0 ? pts[0].target : 0
  const targetY = padding.top + innerH - (targetLine / maxY) * innerH

  return (
    <div>
      <p className="text-xs font-medium text-gray-700 mb-1">{metric.name}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        {/* Y axis labels */}
        <text x={4} y={padding.top + 6} fontSize={9} fill="#6b7280">{maxY}</text>
        <text x={4} y={padding.top + innerH} fontSize={9} fill="#6b7280">0</text>

        {/* Bars (actual) */}
        {pts.map((p, i) => {
          const h = (p.actual / maxY) * innerH
          const x = padding.left + i * barW + barW * 0.15
          const y = padding.top + innerH - h
          const w = barW * 0.7
          const met = p.actual >= p.target
          return (
            <rect
              key={p.date}
              x={x}
              y={y}
              width={w}
              height={h}
              fill={met ? '#111827' : '#9ca3af'}
            >
              <title>{`${p.date} — actual ${p.actual} / target ${p.target}`}</title>
            </rect>
          )
        })}

        {/* Target line — per-day target snapshot (use first as canonical for the band) */}
        {pts.map((p, i) => {
          const x = padding.left + i * barW + barW * 0.15
          const w = barW * 0.7
          const y = padding.top + innerH - (p.target / maxY) * innerH
          return (
            <line
              key={`t-${p.date}`}
              x1={x}
              x2={x + w}
              y1={y}
              y2={y}
              stroke="#111827"
              strokeWidth={1.5}
              strokeDasharray="3 2"
            />
          )
        })}

        {/* X axis */}
        <line
          x1={padding.left}
          x2={padding.left + innerW}
          y1={padding.top + innerH}
          y2={padding.top + innerH}
          stroke="#d1d5db"
          strokeWidth={1}
        />
        {/* First + last date labels */}
        {pts.length > 0 && (
          <>
            <text x={padding.left} y={height - 6} fontSize={9} fill="#6b7280">{pts[0].date.slice(5)}</text>
            <text x={padding.left + innerW} y={height - 6} fontSize={9} fill="#6b7280" textAnchor="end">{pts[pts.length - 1].date.slice(5)}</text>
          </>
        )}

        {/* Suppress unused warning */}
        <text x={0} y={0} fontSize={0} fill="transparent">{targetY}</text>
      </svg>
    </div>
  )
}

// ── Chart 2 — Time-to-Output Efficiency scatter ─────────────────────────────
function EfficiencyScatter({ daily }: { daily: DailyPoint[] }) {
  const pts = daily.filter((d) => d.totalHours > 0 || d.sumTarget > 0).map((d) => ({
    date: d.date,
    hours: d.totalHours,
    pct: d.sumTarget > 0 ? (d.sumActual / d.sumTarget) * 100 : 0,
  }))
  const width = 700
  const height = 260
  const padding = { top: 14, right: 14, bottom: 28, left: 36 }
  const innerW = width - padding.left - padding.right
  const innerH = height - padding.top - padding.bottom
  const maxX = Math.max(8, ...pts.map((p) => p.hours))
  const maxY = Math.max(100, ...pts.map((p) => p.pct))

  // Trendline (simple least squares)
  let trend: { x1: number; y1: number; x2: number; y2: number } | null = null
  if (pts.length >= 2) {
    const n = pts.length
    const sumX = pts.reduce((s, p) => s + p.hours, 0)
    const sumY = pts.reduce((s, p) => s + p.pct, 0)
    const sumXY = pts.reduce((s, p) => s + p.hours * p.pct, 0)
    const sumXX = pts.reduce((s, p) => s + p.hours * p.hours, 0)
    const denom = n * sumXX - sumX * sumX
    if (denom !== 0) {
      const slope = (n * sumXY - sumX * sumY) / denom
      const intercept = (sumY - slope * sumX) / n
      const y0 = intercept
      const yMax = slope * maxX + intercept
      trend = {
        x1: padding.left,
        y1: padding.top + innerH - (y0 / maxY) * innerH,
        x2: padding.left + innerW,
        y2: padding.top + innerH - (yMax / maxY) * innerH,
      }
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-1">Time-to-Output Efficiency</h3>
      <p className="text-xs text-gray-500 mb-2">Each dot is one day: hours worked (X) vs KPI attainment % (Y).</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        {/* Axes */}
        <line x1={padding.left} x2={padding.left} y1={padding.top} y2={padding.top + innerH} stroke="#d1d5db" />
        <line x1={padding.left} x2={padding.left + innerW} y1={padding.top + innerH} y2={padding.top + innerH} stroke="#d1d5db" />
        {/* Y ticks */}
        {[0, 50, 100].map((y) => {
          const py = padding.top + innerH - (y / maxY) * innerH
          return (
            <g key={y}>
              <line x1={padding.left - 3} x2={padding.left} y1={py} y2={py} stroke="#9ca3af" />
              <text x={padding.left - 6} y={py + 3} fontSize={9} textAnchor="end" fill="#6b7280">{y}%</text>
              <line x1={padding.left} x2={padding.left + innerW} y1={py} y2={py} stroke="#e5e7eb" strokeDasharray="2 3" />
            </g>
          )
        })}
        {/* X label */}
        <text x={padding.left + innerW / 2} y={height - 6} fontSize={10} textAnchor="middle" fill="#6b7280">Hours worked</text>
        <text x={12} y={padding.top + innerH / 2} fontSize={10} textAnchor="middle" fill="#6b7280" transform={`rotate(-90 12 ${padding.top + innerH / 2})`}>KPI %</text>

        {/* Trendline */}
        {trend && (
          <line x1={trend.x1} x2={trend.x2} y1={trend.y1} y2={trend.y2} stroke="#111827" strokeWidth={1.5} strokeDasharray="4 3" />
        )}

        {/* Dots */}
        {pts.map((p) => {
          const cx = padding.left + (p.hours / maxX) * innerW
          const cy = padding.top + innerH - Math.min(1, p.pct / maxY) * innerH
          return (
            <circle key={p.date} cx={cx} cy={cy} r={3.5} fill="#111827">
              <title>{`${p.date} — ${p.hours.toFixed(1)} hr, ${p.pct.toFixed(0)}%`}</title>
            </circle>
          )
        })}

        {pts.length === 0 && (
          <text x={width / 2} y={height / 2} fontSize={11} textAnchor="middle" fill="#9ca3af">
            No data in this range.
          </text>
        )}
      </svg>
    </div>
  )
}

// ── Chart 3 — Inquiry counter ───────────────────────────────────────────────
function InquirySection({ counts, inquiries }: { counts: { total: number; task: number; kpi: number }; inquiries: Inquiry[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">Inquiries</h3>
      <div className="flex items-baseline gap-4 mb-3">
        <div>
          <p className="text-3xl font-bold text-gray-900">{counts.total}</p>
          <p className="text-xs text-gray-500">inquiries this period</p>
        </div>
        <div className="text-xs text-gray-700">
          By KPI: <span className="font-semibold">{counts.kpi}</span>
          <span className="mx-2 text-gray-300">|</span>
          By Task: <span className="font-semibold">{counts.task}</span>
        </div>
      </div>

      {inquiries.length === 0 ? (
        <p className="text-sm text-gray-500">No inquiries.</p>
      ) : (
        <div className="border-t border-gray-100">
          {inquiries.slice(0, 12).map((i) => (
            <div key={`${i.kind}-${i.id}`} className="border-b border-gray-100 py-2 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="font-medium text-gray-900">
                  {i.kind === 'TASK' ? 'Task' : 'KPI'} — {i.label}
                </span>
                <span className="text-xs text-gray-500">{i.date} · {i.status}</span>
              </div>
              {i.question && <p className="text-xs text-gray-700 mt-1 italic">Q: {i.question}</p>}
              {i.response && <p className="text-xs text-gray-700 mt-1">A: {i.response}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
