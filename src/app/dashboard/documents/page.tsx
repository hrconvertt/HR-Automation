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
  id: string; title: string; type: string; version: string | null;
  effectiveDate: string | null; acknowledgments: { status: string }[]
}

export default function DocumentCenterPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 p-6 text-white shadow-md">
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
      <Card className="border-blue-100 bg-blue-50/40">
        <div className="p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-900">Letter requests</p>
            <p className="text-xs text-slate-600 mt-0.5">
              Experience, salary certificate, NOC, confirmation, and other formal letters are managed in the Letters workflow.
            </p>
          </div>
          <Link
            href="/dashboard/letters"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-900 whitespace-nowrap"
          >
            Open Letters <ArrowRight className="w-4 h-4" />
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
        <Link href="/dashboard/policies" className="text-xs text-blue-600 hover:underline">Manage policies →</Link>
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
              const signed = p.acknowledgments.filter((a) => a.status === 'SIGNED').length
              return (
                <TableRow key={p.id} className="hover:bg-slate-50 transition-colors">
                  <TableCell className="font-medium text-sm">{p.title}</TableCell>
                  <TableCell><Badge variant="secondary">{p.type.replace(/_/g, ' ')}</Badge></TableCell>
                  <TableCell className="text-sm">{p.version ?? '—'}</TableCell>
                  <TableCell className="text-sm">{p.effectiveDate ? formatDate(p.effectiveDate) : '—'}</TableCell>
                  <TableCell className="text-sm">{signed}/{p.acknowledgments.length} signed</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}
