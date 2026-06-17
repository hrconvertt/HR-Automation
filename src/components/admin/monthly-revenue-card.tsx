'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TrendingUp } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Metric { month: number; year: number; revenue: number; note: string | null }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

/**
 * Lets HR record gross revenue per month so the Executive dashboard can
 * compute Cost-of-People % and Revenue / Employee.
 */
export function MonthlyRevenueCard() {
  const router = useRouter()
  const now = new Date()
  const [recent, setRecent] = useState<Metric[]>([])
  const [month, setMonth] = useState<number>(now.getMonth() + 1)
  const [year, setYear] = useState<number>(now.getFullYear())
  const [revenue, setRevenue] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function load() {
    const r = await fetch('/api/admin/monthly-revenue')
    const d = await r.json()
    if (d.metrics) setRecent(d.metrics)
  }
  useEffect(() => { load() }, [])

  async function save() {
    setError(''); setSuccess('')
    const rev = Number(revenue)
    if (!Number.isFinite(rev) || rev < 0) { setError('Enter a valid revenue'); return }
    setSaving(true)
    const res = await fetch('/api/admin/monthly-revenue', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, year, revenue: rev, note }),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error || 'Save failed')
      return
    }
    setSuccess(`Recorded ${MONTHS[month - 1]} ${year} revenue.`)
    setRevenue(''); setNote('')
    await load()
    router.refresh()
    setTimeout(() => setSuccess(''), 2000)
  }

  const lastTwelve = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return { m: d.getMonth() + 1, y: d.getFullYear() }
  })

  return (
    <Card className="rounded-xl border-slate-200 overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-slate-700" />
          <p className="text-sm font-semibold text-slate-900">Monthly Revenue</p>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          Drives the Executive dashboard&apos;s <span className="font-medium">Cost of People %</span> and <span className="font-medium">Revenue / Employee</span>.
        </p>
      </div>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Input */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">Month</label>
              <select
                value={`${year}-${month}`}
                onChange={(e) => {
                  const [y, m] = e.target.value.split('-').map(Number)
                  setYear(y); setMonth(m)
                }}
                className="w-full h-10 px-3 rounded-md border border-slate-300 text-sm bg-white"
              >
                {lastTwelve.map(({ m, y }) => (
                  <option key={`${y}-${m}`} value={`${y}-${m}`}>{MONTHS[m - 1]} {y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">Revenue (PKR)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-medium">PKR</span>
                <Input
                  type="number" min={0} step={1000}
                  value={revenue}
                  onChange={(e) => setRevenue(e.target.value)}
                  placeholder="5000000"
                  className="pl-12 tabular-nums"
                />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Note <span className="text-slate-400 font-normal normal-case">(optional)</span>
            </label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. seasonal peak, client X paid bonus" />
          </div>
          {error && <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{error}</p>}
          {success && <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{success}</p>}
          <Button onClick={save} disabled={saving || !revenue} size="sm">
            {saving ? 'Saving…' : 'Record revenue'}
          </Button>
        </div>

        {/* Recent entries */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 overflow-hidden">
          <p className="px-3 py-2 text-[11px] font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-100">
            Last 12 months
          </p>
          <div className="max-h-[260px] overflow-y-auto">
            {recent.length === 0 ? (
              <p className="text-xs text-slate-400 px-3 py-4 text-center">No revenue recorded yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recent.map((r) => (
                  <li key={`${r.year}-${r.month}`} className="px-3 py-2 flex items-baseline justify-between gap-2">
                    <span className="text-xs text-slate-600">{MONTHS[r.month - 1]} {r.year}</span>
                    <span className="text-sm font-semibold text-slate-900 tabular-nums">{formatCurrency(r.revenue)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
