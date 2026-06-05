'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MapPin, Plus, Trash2, Wifi, ChevronDown, ChevronUp } from 'lucide-react'

type Loc = {
  id: string
  name: string
  kind: string
  ipCidrs: string
  ssids: string
  lat: number | null
  lng: number | null
  radiusMeters: number | null
  notes: string | null
  active: boolean
}

function parseArr(s: string): string[] {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : [] } catch { return [] }
}

export default function LocationsManager({ initial }: { initial: Loc[] }) {
  const router = useRouter()
  const [locations] = useState<Loc[]>(initial)
  const [adding, setAdding] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '', kind: 'OFFICE', ssids: '', notes: '',
  })

  async function handleAdd() {
    if (!form.name.trim()) return
    setSaving(true)
    const res = await fetch('/api/attendance/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        kind: form.kind,
        ssids: form.ssids.split(',').map(s => s.trim()).filter(Boolean),
        notes: form.notes || null,
      }),
    })
    setSaving(false)
    if (res.ok) {
      setAdding(false)
      setForm({ name: '', kind: 'OFFICE', ssids: '', notes: '' })
      router.refresh()
    }
  }

  async function handleToggleActive(loc: Loc) {
    await fetch(`/api/attendance/locations/${loc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !loc.active }),
    })
    router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this location?')) return
    await fetch(`/api/attendance/locations/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-blue-600" />
          Allowed Locations
        </CardTitle>
        <Button size="sm" onClick={() => setAdding(!adding)}>
          <Plus className="w-4 h-4 mr-1" /> Add Location
        </Button>
      </CardHeader>
      <CardContent>
        {adding && (
          <div className="border border-dashed border-blue-300 bg-blue-50/40 rounded-lg p-4 mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-700">Name *</label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Convertt HQ — Gulberg" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700">Kind</label>
                <select className="w-full h-9 rounded-md border border-slate-200 px-3 text-sm" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
                  <option value="OFFICE">Office</option>
                  <option value="REMOTE_HOME">Remote home</option>
                  <option value="FIELD">Field site</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">WiFi network names (comma-separated)</label>
              <Input value={form.ssids} onChange={e => setForm({ ...form, ssids: e.target.value })} placeholder="Convertt-Office, Convertt-Guest" />
              <p className="text-xs text-slate-500 mt-1">Used by the mobile clock-in app to verify the employee is on the office WiFi.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Notes</label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional context for HR" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} disabled={saving || !form.name.trim()}>
                {saving ? 'Saving…' : 'Save Location'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {locations.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">
            No locations configured. Trust scoring will be permissive until you add at least one.
          </p>
        ) : (
          <div className="space-y-2">
            {locations.map(loc => {
              const ssids = parseArr(loc.ssids)
              const expanded = expandedId === loc.id
              return (
                <div key={loc.id} className="border border-slate-200 rounded-lg">
                  <button
                    onClick={() => setExpandedId(expanded ? null : loc.id)}
                    className="w-full flex items-center justify-between p-3 hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full ${loc.active ? 'bg-green-500' : 'bg-slate-300'}`} />
                      <div className="text-left">
                        <p className="font-medium text-sm">{loc.name}</p>
                        <p className="text-xs text-slate-500">
                          {loc.kind} · {ssids.length} WiFi network{ssids.length === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                    {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </button>
                  {expanded && (
                    <div className="border-t border-slate-100 p-3 space-y-2 bg-slate-50/50">
                      {ssids.length > 0 && (
                        <div className="text-xs"><Wifi className="w-3 h-3 inline mr-1 text-slate-500" /><strong>WiFi:</strong> {ssids.join(', ')}</div>
                      )}
                      {loc.notes && <p className="text-xs text-slate-600 italic">{loc.notes}</p>}
                      <div className="flex gap-2 pt-2">
                        <Button size="sm" variant="outline" onClick={() => handleToggleActive(loc)}>
                          {loc.active ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleDelete(loc.id)}>
                          <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
