'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sprout, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react'

type SeedReport = {
  attendance: { devices: number; logs: number; locations: number; errors: string[] }
  leave: { policies: number; balances: number; requests: number; errors: string[] }
  policies: { published: number; drafts: number; acks: number; errors: string[] }
}

export default function SeedClient() {
  const [busy, setBusy] = useState<'seed' | 'wipe' | null>(null)
  const [report, setReport] = useState<SeedReport | null>(null)
  const [wipeDeleted, setWipeDeleted] = useState<number | null>(null)
  const [error, setError] = useState('')

  async function seed() {
    setBusy('seed'); setError(''); setReport(null); setWipeDeleted(null)
    const res = await fetch('/api/admin/seed-demo', { method: 'POST' })
    const data = await res.json()
    setBusy(null)
    if (!res.ok) { setError(data.error ?? 'Failed'); return }
    setReport(data.report)
  }

  async function wipe() {
    if (!confirm('Wipe all demo data? This removes only rows tagged [DEMO] — your real data is safe.')) return
    setBusy('wipe'); setError(''); setReport(null); setWipeDeleted(null)
    const res = await fetch('/api/admin/seed-demo', { method: 'DELETE' })
    const data = await res.json()
    setBusy(null)
    if (!res.ok) { setError(data.error ?? 'Failed'); return }
    setWipeDeleted(data.deleted ?? 0)
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Sprout className="w-6 h-6 text-slate-700" /> Demo Data
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Populate Attendance, Leave &amp; Policies with realistic sample data so the system is
          easy to demo or test. Safe to re-run — every row is upserted and tagged with [DEMO].
        </p>
      </div>

      {/* Action card */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-wrap items-start gap-3 justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900">Seed demo data</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Creates: 1 office location, 12 trusted devices, ~110 attendance logs over the last 14 days,
                leave policies + balances + 8 sample leave requests, and 5 policies with mixed acknowledgments.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button onClick={seed} disabled={busy !== null} className="bg-slate-700 hover:bg-slate-700 text-white">
                <Sprout className="w-4 h-4 mr-1.5" /> {busy === 'seed' ? 'Seeding…' : 'Seed Demo Data'}
              </Button>
              <Button
                onClick={wipe}
                disabled={busy !== null}
                variant="outline"
                className="text-slate-700 border-slate-100 hover:bg-slate-50"
              >
                <Trash2 className="w-4 h-4 mr-1.5" /> {busy === 'wipe' ? 'Wiping…' : 'Wipe Demo Data'}
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-slate-100 bg-slate-50/60 px-3 py-2 text-[11px] text-slate-900">
            <strong>Idempotent.</strong> Re-running won&apos;t create duplicates — existing rows are updated
            in place. Wipe only removes rows tagged <code>[DEMO]</code>; your real data is untouched.
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Card>
          <CardContent className="p-4 flex items-start gap-2 bg-slate-50 border-slate-100">
            <AlertTriangle className="w-4 h-4 text-slate-700 mt-0.5" />
            <p className="text-sm text-slate-900">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Wipe result */}
      {wipeDeleted !== null && (
        <Card>
          <CardContent className="p-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-slate-700" />
            <p className="text-sm text-slate-700">
              <strong>{wipeDeleted}</strong> demo rows removed.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Seed report */}
      {report && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" /> Demo data seeded successfully.
          </p>

          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Attendance</p>
              <ul className="text-sm text-slate-700 space-y-1">
                <li>• {report.attendance.locations} office location</li>
                <li>• {report.attendance.devices} trusted devices</li>
                <li>• {report.attendance.logs} attendance logs (last 14 days)</li>
              </ul>
              {report.attendance.errors.length > 0 && (
                <p className="text-xs text-slate-700 mt-2">⚠ {report.attendance.errors.join(' · ')}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Leave</p>
              <ul className="text-sm text-slate-700 space-y-1">
                <li>• {report.leave.policies} leave policy rules</li>
                <li>• {report.leave.balances} employee balances for {new Date().getFullYear()}</li>
                <li>• {report.leave.requests} sample leave requests (pending / approved / rejected / cancelled)</li>
              </ul>
              {report.leave.errors.length > 0 && (
                <p className="text-xs text-slate-700 mt-2">⚠ {report.leave.errors.join(' · ')}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Policies</p>
              <ul className="text-sm text-slate-700 space-y-1">
                <li>• {report.policies.published} published policies (Code of Conduct, IT, Leave, Anti-Harassment)</li>
                <li>• {report.policies.drafts} draft (Remote Work v2)</li>
                <li>• {report.policies.acks} acknowledgment records (~70% signed)</li>
              </ul>
              {report.policies.errors.length > 0 && (
                <p className="text-xs text-slate-700 mt-2">⚠ {report.policies.errors.join(' · ')}</p>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-slate-500 mt-2">
            Now open <strong>Attendance</strong> / <strong>Leave</strong> / <strong>Policies</strong> from the sidebar
            and toggle the role pill to see each view populated with realistic data.
          </p>
        </div>
      )}
    </div>
  )
}
