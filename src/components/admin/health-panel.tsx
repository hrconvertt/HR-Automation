'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Heart, AlertCircle, AlertTriangle, Info, CheckCircle2, Wrench, RefreshCw } from 'lucide-react'

interface HealthCheck {
  id: string
  label: string
  severity: 'info' | 'warn' | 'crit'
  found: number
  sample?: string[]
  autoFixable: boolean
  description: string
}

interface Report {
  scannedAt: string
  checks: HealthCheck[]
  totals: { critical: number; warning: number; info: number; healthy: number }
}

const SEVERITY_TONE: Record<string, { tone: string; Icon: React.ComponentType<{ className?: string }> }> = {
  crit:    { tone: 'border-rose-200 bg-rose-50/60 text-rose-700',         Icon: AlertCircle },
  warn:    { tone: 'border-amber-200 bg-amber-50/60 text-amber-700',      Icon: AlertTriangle },
  info:    { tone: 'border-slate-200 bg-slate-50/60 text-slate-700',      Icon: Info },
  healthy: { tone: 'border-emerald-200 bg-emerald-50/60 text-emerald-700', Icon: CheckCircle2 },
}

export function HealthPanel({ initial }: { initial: Report }) {
  const router = useRouter()
  const [report, setReport] = useState<Report>(initial)
  const [scanning, setScanning] = useState(false)
  const [healing, setHealing] = useState<string | null>(null)
  const [toast, setToast] = useState<string>('')

  async function rescan() {
    setScanning(true)
    const res = await fetch('/api/admin/self-heal')
    const data = await res.json()
    setScanning(false)
    if (data.report) setReport(data.report)
  }

  async function heal(id: string) {
    setHealing(id); setToast('')
    const res = await fetch('/api/admin/self-heal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const data = await res.json()
    setHealing(null)
    if (!res.ok) { setToast(data.error || 'Heal failed'); return }
    setToast(`Fixed ${data.fixed} ${data.fixed === 1 ? 'row' : 'rows'}.`)
    await rescan()
    router.refresh()
  }

  const t = report.totals

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <HealthKpi label="Critical"  value={t.critical} tone="bg-rose-50 text-rose-700"       Icon={AlertCircle} />
        <HealthKpi label="Warnings"  value={t.warning}  tone="bg-amber-50 text-amber-700"     Icon={AlertTriangle} />
        <HealthKpi label="Info"      value={t.info}     tone="bg-slate-50 text-slate-700"     Icon={Info} />
        <HealthKpi label="Healthy"   value={t.healthy}  tone="bg-emerald-50 text-emerald-700" Icon={Heart} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Last scan: {new Date(report.scannedAt).toLocaleString()}
        </p>
        <Button size="sm" variant="outline" onClick={rescan} disabled={scanning}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? 'Scanning…' : 'Re-scan'}
        </Button>
      </div>

      {toast && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm px-3 py-2">
          {toast}
        </div>
      )}

      <Card className="rounded-xl border-slate-200 overflow-hidden">
        <ul className="divide-y divide-slate-100">
          {report.checks.map((c) => {
            const healthy = c.found === 0
            const meta = healthy ? SEVERITY_TONE.healthy : SEVERITY_TONE[c.severity]
            const Icon = meta.Icon
            return (
              <li key={c.id} className="px-4 py-3 flex items-start gap-3">
                <div className={`w-7 h-7 rounded-lg border ${meta.tone} flex items-center justify-center flex-shrink-0`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <p className="text-sm font-semibold text-slate-900">{c.label}</p>
                    <span className="text-xs tabular-nums text-slate-500">
                      {healthy ? <span className="text-emerald-600 font-medium">Clean</span> : `${c.found} found`}
                    </span>
                  </div>
                  {!healthy && (
                    <>
                      <p className="text-xs text-slate-500 mt-0.5">{c.description}</p>
                      {c.sample && c.sample.length > 0 && (
                        <ul className="mt-1.5 text-[11px] text-slate-500 space-y-0.5">
                          {c.sample.map((s, i) => (
                            <li key={i} className="font-mono">· {s}</li>
                          ))}
                          {c.found > c.sample.length && (
                            <li className="text-slate-400">… and {c.found - c.sample.length} more</li>
                          )}
                        </ul>
                      )}
                      {c.autoFixable && (
                        <div className="mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => heal(c.id)}
                            disabled={healing === c.id}
                            className="h-7 text-xs"
                          >
                            <Wrench className="w-3 h-3 mr-1" />
                            {healing === c.id ? 'Healing…' : 'Auto-fix'}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}

function HealthKpi({ label, value, tone, Icon }: { label: string; value: number; tone: string; Icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{label}</p>
          <p className="text-lg font-bold text-slate-900 mt-1.5 tabular-nums">{value}</p>
        </div>
        <div className={`p-2 rounded-lg ${tone}`}><Icon className="w-4 h-4" /></div>
      </div>
    </div>
  )
}
