'use client'

/**
 * Salary Structure — the org-level template.
 *
 * Two things: the default Basic share of gross, and the component library
 * (earnings and deductions). Each component's rate is editable in place; a
 * statutory one can be deactivated but not deleted.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Plus, Loader2, Trash2, Check, Percent, Coins, Lock } from 'lucide-react'
import {
  COMPONENT_TYPES, COMPONENT_TYPE_LABELS, CALCULATION_BASES, CALCULATION_BASIS_LABELS,
  formatValue, type SalaryComponentRow, type ComponentType,
} from '@/lib/salary-components'

const inputCls =
  'w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none '
  + 'focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400'

export function SalaryStructureClient({ basicPctOfGross, components }: {
  basicPctOfGross: number; components: SalaryComponentRow[]
}) {
  const router = useRouter()
  const [basicPct, setBasicPct] = useState(String(basicPctOfGross))
  const [savingBasic, setSavingBasic] = useState(false)
  const [savedBasic, setSavedBasic] = useState(false)
  const [rows, setRows] = useState<SalaryComponentRow[]>(components)
  const [err, setErr] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function saveBasic() {
    setSavingBasic(true); setErr(null)
    const res = await fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ salaryStructureBasicPct: Number(basicPct) || 0 }),
    })
    setSavingBasic(false)
    if (!res.ok) { setErr('Could not save the Basic %.'); return }
    setSavedBasic(true); setTimeout(() => setSavedBasic(false), 2500)
    router.refresh()
  }

  async function patch(id: string, data: Partial<SalaryComponentRow>) {
    setBusyId(id); setErr(null)
    const res = await fetch(`/api/settings/salary-components/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    setBusyId(null)
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? 'Could not update.'); return }
    setRows((p) => p.map((r) => (r.id === id ? { ...r, ...data } : r)))
    router.refresh()
  }

  async function remove(r: SalaryComponentRow) {
    if (!confirm(`Delete "${r.name}"?`)) return
    const res = await fetch(`/api/settings/salary-components/${r.id}`, { method: 'DELETE' })
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? 'Could not delete.'); return }
    setRows((p) => p.filter((x) => x.id !== r.id))
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Salary Structure</h1>
        <p className="text-sm text-slate-500 mt-1">
          The template a salary is built from. Set the default Basic share and manage the
          earnings and deductions. Assigning a structure to a specific employee comes later.
        </p>
      </div>

      {err && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{err}</p>}

      {/* Basic % of gross */}
      <Card>
        <CardHeader className="border-b border-slate-100"><CardTitle>Default Basic share</CardTitle></CardHeader>
        <CardContent className="p-5">
          <p className="text-xs text-slate-500 mb-3">
            What share of gross salary is Basic by default. Commonly 60–70% in Pakistan; the
            allowances make up the rest. Editable — nothing here is fixed.
          </p>
          <div className="flex items-end gap-3 flex-wrap">
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Basic % of gross</span>
              <div className="mt-1 flex items-center gap-1">
                <input type="number" min={0} max={100} value={basicPct}
                  onChange={(e) => { setBasicPct(e.target.value); setSavedBasic(false) }}
                  className={`${inputCls} w-28`} />
                <Percent className="w-4 h-4 text-slate-400" />
              </div>
            </label>
            <Button size="sm" onClick={saveBasic} disabled={savingBasic}>
              {savingBasic ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : savedBasic ? <Check className="w-3.5 h-3.5 mr-1.5" /> : null}
              {savedBasic ? 'Saved' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Component library */}
      <Card>
        <CardHeader className="border-b border-slate-100 flex-row items-center justify-between gap-3">
          <CardTitle>Components <span className="text-slate-400 font-normal">· {rows.length}</span></CardTitle>
          <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="w-3.5 h-3.5 mr-1.5" /> Add component</Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200 bg-slate-50">
                  <th className="text-left font-semibold px-4 py-2">Component</th>
                  <th className="text-left font-semibold px-3 py-2 w-28">Type</th>
                  <th className="text-left font-semibold px-3 py-2 w-44">Basis</th>
                  <th className="text-right font-semibold px-3 py-2 w-28">Default</th>
                  <th className="text-center font-semibold px-3 py-2 w-20">Taxable</th>
                  <th className="text-center font-semibold px-3 py-2 w-20">Active</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((r) => (
                  <tr key={r.id} className={r.active ? '' : 'opacity-50'}>
                    <td className="px-4 py-2">
                      <p className="text-slate-900 flex items-center gap-1.5">
                        {r.name}
                        {r.isStatutory && (
                          <span title="Statutory — cannot be deleted"><Lock className="w-3 h-3 text-slate-400" /></span>
                        )}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                        r.type === 'earning' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}>
                        {COMPONENT_TYPE_LABELS[r.type as ComponentType] ?? r.type}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <select value={r.calculationBasis} disabled={busyId === r.id}
                        onChange={(e) => patch(r.id, { calculationBasis: e.target.value })}
                        className="text-xs rounded border border-slate-200 px-2 py-1 bg-white">
                        {CALCULATION_BASES.map((b) => <option key={b} value={b}>{CALCULATION_BASIS_LABELS[b]}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" min={0} defaultValue={r.defaultValue} disabled={busyId === r.id}
                        onBlur={(e) => { const v = Number(e.target.value); if (v !== r.defaultValue) patch(r.id, { defaultValue: v }) }}
                        className={`${inputCls} w-24 text-right tabular-nums`} />
                      <span className="block text-[10px] text-slate-400 mt-0.5">{formatValue(r.calculationBasis, r.defaultValue)}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={r.isTaxable} disabled={busyId === r.id}
                        onChange={(e) => patch(r.id, { isTaxable: e.target.checked })} className="w-4 h-4 accent-slate-900" />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={r.active} disabled={busyId === r.id}
                        onChange={(e) => patch(r.id, { active: e.target.checked })} className="w-4 h-4 accent-slate-900" />
                    </td>
                    <td className="px-2 py-2">
                      {!r.isStatutory && (
                        <button type="button" aria-label="Delete" className="text-slate-400 hover:text-red-600" onClick={() => remove(r)}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {addOpen && <AddDialog onClose={() => setAddOpen(false)} onErr={setErr} onDone={() => router.refresh()} />}
    </div>
  )
}

function AddDialog({ onClose, onErr, onDone }: {
  onClose: () => void; onErr: (s: string | null) => void; onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [d, setD] = useState({ name: '', type: 'earning', calculationBasis: 'fixed_amount', defaultValue: '', isTaxable: true })

  async function create() {
    setBusy(true); onErr(null)
    const res = await fetch('/api/settings/salary-components', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d),
    })
    setBusy(false)
    if (!res.ok) { onErr((await res.json().catch(() => ({}))).error ?? 'Could not add.'); return }
    onClose(); onDone()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add component</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Name</span>
            <input className={`${inputCls} mt-1`} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })}
              placeholder="e.g. Fuel Allowance" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Type</span>
              <select className={`${inputCls} mt-1 bg-white`} value={d.type} onChange={(e) => setD({ ...d, type: e.target.value })}>
                {COMPONENT_TYPES.map((t) => <option key={t} value={t}>{COMPONENT_TYPE_LABELS[t]}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Basis</span>
              <select className={`${inputCls} mt-1 bg-white`} value={d.calculationBasis} onChange={(e) => setD({ ...d, calculationBasis: e.target.value })}>
                {CALCULATION_BASES.map((b) => <option key={b} value={b}>{CALCULATION_BASIS_LABELS[b]}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Default value</span>
              <input type="number" min={0} className={`${inputCls} mt-1`} value={d.defaultValue} onChange={(e) => setD({ ...d, defaultValue: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 mt-6">
              <input type="checkbox" checked={d.isTaxable} onChange={(e) => setD({ ...d, isTaxable: e.target.checked })} className="w-4 h-4 accent-slate-900" />
              <span className="text-sm text-slate-700">Taxable</span>
            </label>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!d.name.trim() || busy} onClick={create}>
            {busy && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />} Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
