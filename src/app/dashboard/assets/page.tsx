'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Plus, X } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { AssetRegister, type RegisterAsset } from './_components/asset-register'
import { depreciate } from '@/lib/asset-depreciation'

interface Asset extends RegisterAsset {
  type: string; model: string | null; serialNo: string | null; value: number | null
}
interface Assignment {
  id: string; assignedDate: string; condition: string | null;
  assetCode: string | null; assetType: string | null; serialNumber: string | null;
  asset: Asset; employee: { fullName: string; employeeCode: string }
}
interface Employee { id: string; fullName: string; employeeCode: string }

const ASSET_TYPES = [
  { value: 'LAPTOP_DESKTOP', label: 'Laptop / Desktop', dept: 'IT' },
  { value: 'MOBILE_PHONE', label: 'Mobile Phone', dept: 'IT' },
  { value: 'SIM_CARD', label: 'SIM Card', dept: 'IT' },
  { value: 'ACCESS_CARD', label: 'Access Card', dept: 'Admin' },
  { value: 'OFFICE_KEYS', label: 'Office Keys', dept: 'Admin' },
  { value: 'ID_CARD', label: 'ID Card', dept: 'HR' },
  { value: 'SOFTWARE_LICENSE', label: 'Software License', dept: 'IT' },
  { value: 'EMAIL_ACCOUNT', label: 'Email Account', dept: 'IT' },
  { value: 'MONITOR', label: 'Monitor', dept: 'IT' },
  { value: 'HEADPHONES', label: 'Headphones', dept: 'IT' },
  { value: 'KEYBOARD_MOUSE', label: 'Keyboard / Mouse', dept: 'IT' },
  { value: 'LAPTOP_BAG', label: 'Laptop Bag', dept: 'Admin' },
  { value: 'FURNITURE_CHAIR', label: 'Furniture / Chair', dept: 'Admin' },
  { value: 'VEHICLE', label: 'Vehicle', dept: 'Admin' },
  { value: 'DOCUMENTS_CONTRACTS', label: 'Documents / Contracts', dept: 'HR' },
  { value: 'OTHER', label: 'Other', dept: 'Admin' },
]

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [isHR, setIsHR] = useState(false)

  function refresh() {
    fetch('/api/assets/list').then((r) => r.json()).then((d) => {
      setAssets(d.assets ?? [])
      setAssignments(d.assignments ?? [])
    }).catch(() => {})
  }

  useEffect(() => {
    fetch('/api/auth/me').then((r) => r.json()).then((d) => setIsHR(d?.user?.role === 'HR_ADMIN'))
    fetch('/api/employees?limit=200&status=ACTIVE').then((r) => r.json()).then((d) => setEmployees(d.employees ?? []))
    fetch('/api/assets/list').then((r) => r.json()).then((d) => {
      setAssets(d.assets ?? [])
      setAssignments(d.assignments ?? [])
    }).catch(() => {})
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Assets</h1>
        {isHR && (
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Asset
          </Button>
        )}
      </div>

      <AssetRegister assets={assets} />

      {assets.length === 0 && (
        <Card>
          <CardHeader className="border-b border-slate-100"><CardTitle>Asset Inventory</CardTitle></CardHeader>
          <p className="text-center py-8 text-gray-400 text-sm">
            No assets yet. Click Add Asset to start.
          </p>
        </Card>
      )}

      <Card>
        <CardHeader className="border-b border-slate-100"><CardTitle>Active Assignments</CardTitle></CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Asset</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead>Condition</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assignments.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-gray-400">No active assignments.</TableCell></TableRow>
            ) : assignments.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-mono text-xs">{a.assetCode ?? '—'}</TableCell>
                <TableCell>
                  <p className="font-medium">{a.asset.name}</p>
                  <p className="text-xs text-gray-400">{(a.assetType ?? a.asset.type).replace(/_/g, ' ')}</p>
                </TableCell>
                <TableCell>
                  <p className="font-medium">{a.employee.fullName}</p>
                  <p className="text-xs text-gray-400">{a.employee.employeeCode}</p>
                </TableCell>
                <TableCell>{formatDate(a.assignedDate)}</TableCell>
                <TableCell>{a.condition ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {addOpen && (
        <AddAssetDialog
          employees={employees}
          assetTypes={ASSET_TYPES}
          onClose={() => setAddOpen(false)}
          onDone={() => { setAddOpen(false); refresh() }}
        />
      )}
    </div>
  )
}

function AddPreview({ cost, life, residual, purchaseDate }: {
  cost: string; life: string; residual: string; purchaseDate: string
}) {
  const c = Number(cost)
  if (!cost || !Number.isFinite(c) || c <= 0) return null
  const d = depreciate({
    purchasePricePkr: c,
    estimatedLifeYears: life ? Number(life) : null,
    residualValue: residual ? Number(residual) : null,
    purchaseDate: purchaseDate || null,
  })
  const money = (n: number | null) => (n == null ? '—' : 'PKR ' + Math.round(n).toLocaleString('en-PK'))
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">
        Works out to
      </p>
      <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-[12px]">
        <Cell k="Residual" v={money(d.residual)} />
        <Cell k="Per year" v={money(d.annual)} />
        <Cell k="Per month" v={money(d.monthly)} />
        <Cell k="Total months" v={d.totalMonths != null ? String(d.totalMonths) : '—'} />
        <Cell k="Months elapsed" v={d.monthsElapsed != null ? String(d.monthsElapsed) : '—'} />
        <Cell k="Months left" v={d.monthsLeft != null ? String(d.monthsLeft) : '—'} />
        <Cell k="Years left" v={d.yearsLeft != null ? d.yearsLeft.toFixed(1) : '—'} />
        <Cell k="Written off" v={money(d.accumulated)} />
        <Cell k="Book value" v={money(d.bookValue)} />
      </div>
      {!life && (
        <p className="text-[11px] text-slate-400 mt-1.5">
          Set an estimated life and the rest of these fill in.
        </p>
      )}
    </div>
  )
}

function Cell({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <span className="block text-[10px] text-slate-400">{k}</span>
      <span className="tabular-nums text-slate-800">{v}</span>
    </div>
  )
}

function AddAssetDialog({
  employees, assetTypes, onClose, onDone,
}: {
  employees: Employee[]
  assetTypes: typeof ASSET_TYPES
  onClose: () => void
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [assetType, setAssetType] = useState('LAPTOP_DESKTOP')
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [conditionAtIssue, setConditionAtIssue] = useState('NEW')
  const [costPkr, setCostPkr] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [assignedToEmployeeId, setAssignedToEmployeeId] = useState('')
  const [notes, setNotes] = useState('')
  const [assetCode, setAssetCode] = useState('')
  // Register fields. Without a life and a cost the Assets screen can compute
  // nothing for this asset, so the form asks for them rather than leaving a
  // row of blanks to be filled in later.
  const [category, setCategory] = useState('Electronic')
  const [subCategory, setSubCategory] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [estimatedLifeYears, setEstimatedLifeYears] = useState('')
  const [residualValue, setResidualValue] = useState('')
  const [currentMarketValue, setCurrentMarketValue] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [locationLabel, setLocationLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/assets/next-code').then((r) => r.json()).then((d) => setAssetCode(d.next ?? '')).catch(() => {})
  }, [])

  const meta = assetTypes.find((t) => t.value === assetType)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required.'); return }
    setBusy(true); setError(null)
    const res = await fetch('/api/assets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, assetType, brand, model, serialNumber, conditionAtIssue,
        costPkr: costPkr || null,
        purchaseDate: purchaseDate || null,
        custodianDept: meta?.dept ?? 'Admin',
        notes,
        assignedToEmployeeId: assignedToEmployeeId || null,
        assetCode,
        category, subCategory,
        quantity: quantity || 1,
        estimatedLifeYears: estimatedLifeYears || null,
        residualValue: residualValue || null,
        currentMarketValue: currentMarketValue || null,
        photoUrl: photoUrl || null,
        locationLabel: locationLabel || null,
      }),
    })
    setBusy(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d?.error ?? 'Could not create asset.'); return
    }
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="text-base font-semibold text-slate-900">Add Asset</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Asset Code"><Input value={assetCode} onChange={(e) => setAssetCode(e.target.value)} /></Field>
            <Field label="Type">
              <Select value={assetType} onValueChange={setAssetType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {assetTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Name (description)"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dell XPS 13 9320" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Brand"><Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Dell" /></Field>
            <Field label="Model"><Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="XPS 13 9320" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Serial Number"><Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} /></Field>
            <Field label="Condition">
              <Select value={conditionAtIssue} onValueChange={setConditionAtIssue}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NEW">New</SelectItem>
                  <SelectItem value="GOOD">Good</SelectItem>
                  <SelectItem value="USED">Used</SelectItem>
                  <SelectItem value="DAMAGED">Damaged</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category"><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Electronic" /></Field>
            <Field label="Sub-category"><Input value={subCategory} onChange={(e) => setSubCategory(e.target.value)} placeholder="Laptop" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity"><Input type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>
            <Field label="Location / department"><Input value={locationLabel} onChange={(e) => setLocationLabel(e.target.value)} placeholder="Kitchen, CEO Office, Media Team…" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cost (PKR)"><Input type="number" value={costPkr} onChange={(e) => setCostPkr(e.target.value)} /></Field>
            <Field label="Purchase Date"><Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Estimated life (years)">
              <Input type="number" step="0.5" min="0" value={estimatedLifeYears}
                onChange={(e) => setEstimatedLifeYears(e.target.value)} placeholder="e.g. 2" />
            </Field>
            <Field label="Residual value (PKR)">
              <Input type="number" value={residualValue} onChange={(e) => setResidualValue(e.target.value)}
                placeholder={costPkr ? String(Math.round(Number(costPkr) * 0.5)) : 'cost x 50%'} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Current market value (PKR)"><Input type="number" value={currentMarketValue} onChange={(e) => setCurrentMarketValue(e.target.value)} /></Field>
            <Field label="Asset picture (link)"><Input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://drive.google.com/…" /></Field>
          </div>

          {/* What those figures come to, before the asset is saved. */}
          <AddPreview cost={costPkr} life={estimatedLifeYears} residual={residualValue} purchaseDate={purchaseDate} />
          <Field label="Assign To (optional)">
            <Select value={assignedToEmployeeId} onValueChange={setAssignedToEmployeeId}>
              <SelectTrigger><SelectValue placeholder="Unassigned (in inventory)" /></SelectTrigger>
              <SelectContent>
                {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <p className="text-xs text-slate-500">Custodian dept: <strong>{meta?.dept ?? 'Admin'}</strong> (auto-assigned by type)</p>
          {error && <p className="text-sm text-slate-700">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add Asset'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  )
}
