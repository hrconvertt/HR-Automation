'use client'

/**
 * Document Center — unified module for HR-issued letters and company policies.
 *
 *   Letters   → formal HR-issued letters (experience, salary cert, NOC, etc.)
 *   Policies  → company policy documents + acknowledgments
 *
 * Per-employee files live ONLY on the People profile (Documents tab) —
 * no duplicate upload entry-point here.
 */

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Mail, FolderOpen, ShieldCheck } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface PolicyDoc {
  id: string; title: string; type: string; version: string | null;
  effectiveDate: string | null; acknowledgments: { status: string }[]
}
interface Letter {
  id: string; letterNumber: string | null; letterType: string;
  purpose: string | null; status: string; requestedAt: string;
  employee?: { id: string; fullName: string; employeeCode: string }
}

const LETTER_STATUS_TONE: Record<string, 'default' | 'success' | 'warning' | 'secondary'> = {
  PENDING: 'warning',
  APPROVED: 'default',
  GENERATED: 'success',
  REJECTED: 'secondary',
}

export default function DocumentCenterPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400">Loading…</div>}>
      <DocumentCenterPageInner />
    </Suspense>
  )
}

function DocumentCenterPageInner() {
  const sp = useSearchParams()
  // Employee Files tab was removed (uploads live on the People profile only).
  // If a legacy ?employee=... or ?tab=files link lands here, fall through to
  // Letters — the link target was deprecated.
  const initialTab = sp.get('tab') === 'policies' ? 'policies' : 'letters'
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
              Issued letters and company policies. Employee files are in each employee&apos;s profile.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue={initialTab}>
        <TabsList className="bg-white border border-slate-200 rounded-lg p-1 inline-flex">
          <TabsTrigger value="letters"><Mail className="w-3.5 h-3.5 mr-1.5" /> Letters</TabsTrigger>
          <TabsTrigger value="policies"><ShieldCheck className="w-3.5 h-3.5 mr-1.5" /> Policies</TabsTrigger>
        </TabsList>

        <TabsContent value="letters" className="mt-4 transition-opacity duration-150">
          <LettersTab />
        </TabsContent>

        <TabsContent value="policies" className="mt-4 transition-opacity duration-150">
          <PoliciesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/* ─────────────────────── LETTERS TAB ─────────────────────── */

const LETTER_STATUSES = ['PENDING', 'APPROVED', 'GENERATED', 'REJECTED'] as const

function LettersTab() {
  const [letters, setLetters] = useState<Letter[]>([])
  const [loading, setLoading] = useState(true)
  const [statusTab, setStatusTab] = useState<string>('PENDING')

  useEffect(() => {
    fetch('/api/letters').then((r) => r.json()).then((d) => {
      setLetters(d.letters ?? d.requests ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const counts: Record<string, number> = {}
  for (const s of LETTER_STATUSES) counts[s] = letters.filter((l) => l.status === s).length
  const filtered = letters.filter((l) => l.status === statusTab)

  return (
    <Card>
      <CardHeader className="border-b border-slate-100 flex items-center justify-between flex-row">
        <CardTitle>Letter Requests</CardTitle>
        <Link href="/dashboard/letters" className="text-xs text-blue-600 hover:underline">Open full Letters page →</Link>
      </CardHeader>
      <CardContent className="p-4">
        <Tabs value={statusTab} onValueChange={setStatusTab}>
          <TabsList className="bg-slate-50 border border-slate-200 rounded-md p-1 inline-flex mb-3">
            {LETTER_STATUSES.map((s) => (
              <TabsTrigger key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
                <span className="ml-1.5 text-xs text-slate-500">({counts[s] ?? 0})</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {LETTER_STATUSES.map((s) => (
            <TabsContent key={s} value={s}>
              {loading ? (
                <p className="py-8 text-center text-sm text-slate-400">Loading…</p>
              ) : filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  {s === 'PENDING' && 'No pending letter requests.'}
                  {s === 'APPROVED' && 'No approved letters waiting to be handed over.'}
                  {s === 'GENERATED' && 'No generated letters yet.'}
                  {s === 'REJECTED' && 'No rejected letters.'}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Letter #</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((l) => (
                      <TableRow key={l.id} className="hover:bg-slate-50 transition-colors">
                        <TableCell className="font-mono text-xs">{l.letterNumber ?? '—'}</TableCell>
                        <TableCell>
                          <p className="font-medium text-sm">{l.employee?.fullName ?? '—'}</p>
                          <p className="text-xs text-slate-500">{l.employee?.employeeCode}</p>
                        </TableCell>
                        <TableCell><Badge variant="secondary">{l.letterType.replace(/_/g, ' ')}</Badge></TableCell>
                        <TableCell className="text-sm text-slate-700 truncate max-w-[200px]">{l.purpose ?? '—'}</TableCell>
                        <TableCell className="text-sm text-slate-600">{formatDate(l.requestedAt)}</TableCell>
                        <TableCell><Badge variant={LETTER_STATUS_TONE[l.status] ?? 'default'}>{l.status}</Badge></TableCell>
                        <TableCell>
                          <Link href={`/dashboard/letters?focus=${l.id}`} prefetch className="text-blue-600 hover:underline text-sm">Open →</Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  )
}

/* ─────────────────────── POLICIES TAB ─────────────────────── */

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
        <CardTitle>Company Policies</CardTitle>
        <Link href="/dashboard/policies" className="text-xs text-blue-600 hover:underline">Manage policies →</Link>
      </CardHeader>
      {loading ? (
        <CardContent className="py-8 text-center text-sm text-slate-400">Loading…</CardContent>
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
