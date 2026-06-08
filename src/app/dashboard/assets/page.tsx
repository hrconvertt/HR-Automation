'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Plus, X } from 'lucide-react'
import { formatDate, formatCurrency } from '@/lib/utils'

interface Asset { id: string; name: string; type: string; brand: string | null; model: string | null; serialNo: string | null; value: number | null; status: string }
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

const statusVariant: Record<string, 'success' | 'default' | 'warning' | 'destructive'> = {
  AVAILABLE: 'success',
  ASSIGNED: 'default',
  MAINTENANCE: 'warning',
  DISPOSED: 'destructive',
}

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

      <Card>
        <CardHeader className="border-b border-slate-100"><CardTitle>Asset Inventory ({assets.length})</CardTitle></CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Brand / Model</TableHead>
              <TableHead>Serial</TableHead>
              {isHR && <TableHead>Cost</TableHead>}
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assets.length === 0 ? (
              <TableRow><TableCell colSpan={isHR ? 6 : 5} className="text-center py-8 text-gray-400">No assets. Click Add Asset to start.</TableCell></TableRow>
            ) : assets.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.name}</TableCell>
                <TableCell><Badge variant="secondary">{a.type.replace(/_/g, ' ')}</Badge></TableCell>
                <TableCell>{[a.brand, a.model].filter(Boolean).join(' / ') || '—'}</TableCell>
                <TableCell className="font-mono text-xs">{a.serialNo ?? '—'}</TableCell>
                {isHR && <TableCell>{a.value ? formatCurrency(a.value) : '—'}</TableCell>}
                <TableCell><Badge variant={statusVariant[a.status] ?? 'secondary'}>{a.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

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
            <Field label="Cost (PKR)"><Input type="number" value={costPkr} onChange={(e) => setCostPkr(e.target.value)} /></Field>
            <Field label="Purchase Date"><Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} /></Field>
          </div>
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
          {error && <p className="text-sm text-rose-600">{error}</p>}
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
