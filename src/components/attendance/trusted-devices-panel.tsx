'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Smartphone, ShieldCheck, ShieldOff, Clock } from 'lucide-react'

type Device = {
  id: string
  employeeName: string
  employeeCode: string
  deviceHash: string
  label: string | null
  userAgent: string | null
  status: string
  firstSeenAt: string
  lastUsedAt: string
}

function uaShort(ua: string | null): string {
  if (!ua) return 'Unknown'
  if (ua.includes('Mac')) return 'macOS'
  if (ua.includes('Windows')) return 'Windows'
  if (ua.includes('Linux')) return 'Linux'
  if (ua.includes('Android')) return 'Android'
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS'
  return 'Browser'
}

function fmtDate(s: string) {
  return new Date(s).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function TrustedDevicesPanel({ initial }: { initial: Device[] }) {
  const router = useRouter()
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'TRUSTED' | 'REVOKED'>('PENDING')

  const filtered = useMemo(
    () => (filter === 'ALL' ? initial : initial.filter(d => d.status === filter)),
    [initial, filter],
  )

  async function handleAction(deviceId: string, action: 'TRUST' | 'REVOKE') {
    await fetch('/api/attendance/trusted-devices', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, action }),
    })
    router.refresh()
  }

  const counts = {
    pending: initial.filter(d => d.status === 'PENDING').length,
    trusted: initial.filter(d => d.status === 'TRUSTED').length,
    revoked: initial.filter(d => d.status === 'REVOKED').length,
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-blue-600" />
          Trusted Devices
        </CardTitle>
        <div className="flex gap-2 pt-2 flex-wrap">
          <FilterChip label={`Pending (${counts.pending})`} active={filter === 'PENDING'} onClick={() => setFilter('PENDING')} />
          <FilterChip label={`Trusted (${counts.trusted})`} active={filter === 'TRUSTED'} onClick={() => setFilter('TRUSTED')} />
          <FilterChip label={`Revoked (${counts.revoked})`} active={filter === 'REVOKED'} onClick={() => setFilter('REVOKED')} />
          <FilterChip label="All" active={filter === 'ALL'} onClick={() => setFilter('ALL')} />
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">
            {filter === 'PENDING' ? 'No devices waiting for approval.' : 'No devices in this view.'}
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map(dev => (
              <div key={dev.id} className="flex items-center justify-between border border-slate-200 rounded-lg p-3 gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">{dev.employeeName}</p>
                    <span className="text-xs text-slate-400">{dev.employeeCode}</span>
                    <StatusBadge status={dev.status} />
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {dev.label ?? uaShort(dev.userAgent)} · <code className="text-slate-400">{dev.deviceHash.slice(0, 12)}…</code>
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    <Clock className="w-3 h-3 inline mr-1" />
                    First seen {fmtDate(dev.firstSeenAt)} · Last used {fmtDate(dev.lastUsedAt)}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {dev.status !== 'TRUSTED' && (
                    <Button size="sm" onClick={() => handleAction(dev.id, 'TRUST')}>
                      <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Trust
                    </Button>
                  )}
                  {dev.status !== 'REVOKED' && (
                    <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleAction(dev.id, 'REVOKE')}>
                      <ShieldOff className="w-3.5 h-3.5 mr-1" /> Revoke
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium ${
        active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
      }`}
    >
      {label}
    </button>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'TRUSTED') return <Badge variant="success">Trusted</Badge>
  if (status === 'PENDING') return <Badge variant="warning">Pending</Badge>
  return <Badge variant="destructive">Revoked</Badge>
}
