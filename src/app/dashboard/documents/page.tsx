'use client'

/**
 * Document Center — company policies + acknowledgments.
 *
 * Letters (experience, salary cert, NOC, etc.) live in /dashboard/letters
 * which is the dedicated workflow surface for letter requests.
 * Per-employee files live on the employee profile (Documents tab).
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { FolderOpen, ShieldCheck, ArrowRight } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface PolicyDoc {
  id: string; title: string; type: string; status?: string | null; version: string | null;
  effectiveDate: string | null; acknowledgments: { status: string }[]
}

const STATUS_CHIP: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 border-slate-200',
  IN_REVIEW: 'bg-slate-50 text-slate-900 border-slate-100',
  ACTIVE: 'bg-slate-50 text-slate-900 border-slate-100',
  ARCHIVED: 'bg-slate-100 text-slate-500 border-slate-200',
  RETIRED: 'bg-slate-100 text-slate-500 border-slate-200',
}

export default function DocumentCenterPage() {
  return (
    <div className="space-y-6">
      {/* Header — charcoal hero (branding) */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-md">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-white/15 p-3 backdrop-blur">
            <FolderOpen className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">Document Center</h1>
            <p className="text-white/85 mt-1 text-sm">
              Company policies and acknowledgments. Employee files live on each person&apos;s profile.
            </p>
          </div>
        </div>
      </div>

      {/* Pointer to Letters workflow (moved out) */}
      <Card className="border-slate-100 bg-slate-50/40">
        <div className="p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-900">Letter requests</p>
            <p className="text-xs text-slate-600 mt-0.5">
              Experience, salary certificate, NOC, confirmation, and other formal letters are managed in the Letters workflow.
            </p>
          </div>
          <Link
            href="/dashboard/letters"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-slate-900 whitespace-nowrap"
          >
            Open Letters
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </Card>

      <PoliciesTab />
    </div>
  )
}

/* ─────────────────────── POLICIES ─────────────────────── */

function PoliciesTab() {
  const [policies, setPolicies] = useState<PolicyDoc[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/documents/policies').then((r) => r.json()).then((d) => {
      setPolicies(d.policies ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  return (
    <Card>
      <CardHeader className="border-b border-slate-100 flex items-center justify-between flex-row">
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-slate-600" /> Company Policies
        </CardTitle>
        <Link
          href="/dashboard/policies"
          className="group inline-flex items-center gap-1 text-xs text-slate-700 hover:underline"
        >
          Manage policies
          <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </CardHeader>
      {loading ? (
        <div className="py-8 text-center text-sm text-slate-400">Loading…</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Effective</TableHead>
              <TableHead>Acknowledgments</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {policies.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-400">No policy documents.</TableCell></TableRow>
            ) : policies.map((p) => {
              const total = p.acknowledgments.length
              const signed = p.acknowledgments.filter((a) => a.status === 'SIGNED').length
              const pct = total > 0 ? Math.round((signed / total) * 100) : 0
              const statusKey = (p.status ?? '').toUpperCase()
              const chipClass = STATUS_CHIP[statusKey] ?? 'bg-slate-100 text-slate-700 border-slate-200'
              return (
                <TableRow
                  key={p.id}
                  className="hover:bg-slate-50/60 transition"
                >
                  <TableCell className="py-3 font-medium text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{p.title}</span>
                      {p.status && (
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${chipClass}`}
                        >
                          {p.status.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-3"><Badge variant="secondary">{p.type.replace(/_/g, ' ')}</Badge></TableCell>
                  <TableCell className="py-3 text-sm">{p.version ?? '—'}</TableCell>
                  <TableCell className="py-3 text-sm">{p.effectiveDate ? formatDate(p.effectiveDate) : '—'}</TableCell>
                  <TableCell className="py-3 text-sm">
                    {total === 0 ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <div className="flex items-center gap-2 min-w-[140px]">
                        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full bg-slate-500 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-600 tabular-nums whitespace-nowrap">
                          {signed}/{total}
                        </span>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}
