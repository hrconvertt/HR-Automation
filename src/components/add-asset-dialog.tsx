'use client'

/**
 * Add Asset dialog — HR-only. Creates an Asset + AssetAssignment in one
 * call via POST /api/assets. Used on the Employee profile Assets tab.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Plus, X, AlertCircle } from 'lucide-react'

interface Props {
  employeeId: string
}

const ASSET_TYPES = [
  { value: 'LAPTOP_DESKTOP', label: 'Laptop / Desktop' },
  { value: 'MOBILE_PHONE', label: 'Mobile Phone' },
  { value: 'MONITOR', label: 'Monitor' },
  { value: 'KEYBOARD_MOUSE', label: 'Keyboard / Mouse' },
  { value: 'HEADPHONES', label: 'Headphones' },
  { value: 'ID_CARD', label: 'ID Card' },
  { value: 'SIM_CARD', label: 'SIM Card' },
  { value: 'ACCESS_CARD', label: 'Access Card' },
  { value: 'LAPTOP_BAG', label: 'Laptop Bag' },
  { value: 'FURNITURE_CHAIR', label: 'Furniture / Chair' },
  { value: 'OTHER', label: 'Other' },
]

export default function AddAssetDialog({ employeeId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [assetType, setAssetType] = useState('LAPTOP_DESKTOP')
  const [name, setName] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [assignedDate, setAssignedDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function reset() {
    setAssetType('LAPTOP_DESKTOP')
    setName('')
    setSerialNumber('')
    setAssignedDate(new Date().toISOString().slice(0, 10))
    setNotes('')
    setErr(null)
  }

  async function handleSubmit() {
    if (!name.trim()) { setErr('Asset name is required.'); return }
    setBusy(true); setErr(null)
    try {
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          assetType,
          serialNumber: serialNumber.trim() || null,
          purchaseDate: null,
          notes: notes.trim() || null,
          assignedToEmployeeId: employeeId,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed to add asset')
      }
      setOpen(false)
      reset()
      router.refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to add asset')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4 mr-1.5" /> Add Asset
      </Button>

      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-base text-slate-900">Assign new asset</h3>
              <button
                onClick={() => !busy && setOpen(false)}
                className="text-slate-400 hover:text-slate-700 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1.5 block uppercase tracking-wider">
                  Asset Type <span className="text-rose-500">*</span>
                </label>
                <Select value={assetType} onValueChange={setAssetType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSET_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1.5 block uppercase tracking-wider">
                  Asset Name <span className="text-rose-500">*</span>
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder='e.g. "MacBook Pro 14" — 2023"'
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1.5 block uppercase tracking-wider">
                  Serial Number
                </label>
                <Input
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  placeholder="e.g. C02XL0AAJHD2"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1.5 block uppercase tracking-wider">
                  Assigned Date
                </label>
                <Input
                  type="date"
                  value={assignedDate}
                  onChange={(e) => setAssignedDate(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1.5 block uppercase tracking-wider">
                  Notes
                </label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional"
                />
              </div>

              {err && (
                <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-700 leading-relaxed">{err}</p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={busy || !name.trim()}>
                {busy ? 'Adding…' : 'Add Asset'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
