'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Trash2, Plus, Loader2 } from 'lucide-react'
import { annualIncomeTax, type TaxSlabRow } from '@/lib/income-tax'

interface Slab extends TaxSlabRow { id: string }

export default function TaxSlabsSettingsPage() {
  const [year, setYear] = useState('')
  const [years, setYears] = useState<string[]>([])
  const [slabs, setSlabs] = useState<Slab[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [preview, setPreview] = useState(1500000)

  const load = useCallback((y?: string) => {
    setLoading(true)
    const qs = y ? `?year=${encodeURIComponent(y)}` : ''
    fetch(`/api/settings/tax-slabs${qs}`).then((r) => r.json()).then((d) => {
      setYear(d.year); setYears(d.years?.length ? d.years : [d.year]); setSlabs(d.slabs ?? [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function patch(id: string, field: keyof Slab, value: string) {
    setSlabs((prev) => prev.map((s) => s.id === id
      ? { ...s, [field]: field === 'incomeTo' && value === '' ? null : Number(value) }
      : s))
  }

  async function persist(s: Slab) {
    setSavingId(s.id)
    await fetch(`/api/settings/tax-slabs/${s.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        incomeFrom: s.incomeFrom, incomeTo: s.incomeTo,
        ratePercent: s.ratePercent, fixedAmount: s.fixedAmount,
      }),
    })
    setSavingId(null)
  }

  async function addSlab() {
    const lastFrom = slabs.length ? Math.max(...slabs.map((s) => s.incomeFrom)) : 0
    const res = await fetch('/api/settings/tax-slabs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taxYear: year, incomeFrom: lastFrom + 100000, incomeTo: null, ratePercent: 0, fixedAmount: 0 }),
    })
    if (res.ok) load(year)
  }

  async function remove(id: string) {
    await fetch(`/api/settings/tax-slabs/${id}`, { method: 'DELETE' })
    load(year)
  }

  const tax = annualIncomeTax(preview, slabs)
  const effRate = preview > 0 ? (tax / preview) * 100 : 0

  return (
    <Card>
      <CardHeader className="border-b border-slate-100 flex-row items-center justify-between">
        <CardTitle>Income Tax Slabs (FBR)</CardTitle>
        <select className="h-9 rounded-md border border-slate-200 px-2 text-sm bg-white"
          value={year} onChange={(e) => load(e.target.value)}>
          {years.map((y) => <option key={y} value={y}>Tax year {y}</option>)}
        </select>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        <p className="text-sm text-slate-500">
          Salaried brackets for the year. Tax on a salary = <em>fixed amount</em> + <em>rate</em> × (income above <em>from</em>).
          Edit any number and it saves when you click away. These drive every payroll tax calculation.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-slate-400 text-left">
                  <th className="py-2 pr-3 font-medium">From (PKR/yr)</th>
                  <th className="py-2 pr-3 font-medium">To (blank = &amp; above)</th>
                  <th className="py-2 pr-3 font-medium">Rate %</th>
                  <th className="py-2 pr-3 font-medium">Fixed amount</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {slabs.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3">
                      <Input type="number" className="w-32" value={s.incomeFrom}
                        onChange={(e) => patch(s.id, 'incomeFrom', e.target.value)} onBlur={() => persist(s)} />
                    </td>
                    <td className="py-1.5 pr-3">
                      <Input type="number" className="w-32" value={s.incomeTo ?? ''} placeholder="& above"
                        onChange={(e) => patch(s.id, 'incomeTo', e.target.value)} onBlur={() => persist(s)} />
                    </td>
                    <td className="py-1.5 pr-3">
                      <Input type="number" step={0.1} className="w-20" value={s.ratePercent}
                        onChange={(e) => patch(s.id, 'ratePercent', e.target.value)} onBlur={() => persist(s)} />
                    </td>
                    <td className="py-1.5 pr-3">
                      <Input type="number" className="w-32" value={s.fixedAmount}
                        onChange={(e) => patch(s.id, 'fixedAmount', e.target.value)} onBlur={() => persist(s)} />
                    </td>
                    <td className="py-1.5 text-right">
                      {savingId === s.id
                        ? <Loader2 className="w-4 h-4 animate-spin text-slate-400 inline" />
                        : <button onClick={() => remove(s.id)} className="text-slate-300 hover:text-red-600">
                            <Trash2 className="w-4 h-4" />
                          </button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button size="sm" variant="outline" className="mt-3" onClick={addSlab}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add bracket
            </Button>
          </div>
        )}

        {/* Live check — type any annual salary, see the tax these slabs produce. */}
        <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/40 max-w-md">
          <p className="text-sm font-semibold text-slate-800 mb-2">Quick check</p>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs text-slate-500 mb-1">Annual taxable income (PKR)</label>
              <Input type="number" step={50000} value={preview} onChange={(e) => setPreview(Number(e.target.value))} />
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Annual tax</p>
              <p className="text-lg font-semibold tabular-nums">PKR {tax.toLocaleString('en-PK')}</p>
              <p className="text-[11px] text-slate-400">
                {effRate.toFixed(1)}% effective · PKR {Math.round(tax / 12).toLocaleString('en-PK')}/mo
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
