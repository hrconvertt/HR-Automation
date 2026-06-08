'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { ShieldCheck, AlertTriangle } from 'lucide-react'

interface ProbationListItem {
  id: string
  status: string
  startDate: string
  endDate: string
  durationMonths: number
  warningCount: number
  employee: {
    id: string
    fullName: string
    employeeCode: string
    designation: string
    department: { name: string } | null
    reportingManager: { id: string; fullName: string } | null
  }
}

const STATUSES = ['ACTIVE', 'UNDER_REVIEW', 'CONFIRMED', 'EXTENDED', 'WARNED', 'TERMINATED'] as const

const STATUS_TONE: { [key: string]: string } = {
  ACTIVE: 'bg-blue-50 text-blue-700 border-blue-200',
  UNDER_REVIEW: 'bg-amber-50 text-amber-700 border-amber-200',
  CONFIRMED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  EXTENDED: 'bg-violet-50 text-violet-700 border-violet-200',
  WARNED: 'bg-orange-50 text-orange-700 border-orange-200',
  TERMINATED: 'bg-rose-50 text-rose-700 border-rose-200',
}

function daysLeft(endIso: string): number {
  return Math.floor((new Date(endIso).getTime() - Date.now()) / 86_400_000)
}

export default function ProbationListPage() {
  const [records, setRecords] = useState<ProbationListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<string>('ACTIVE')

  useEffect(() => {
    fetch('/api/probation')
      .then((r) => r.json())
      .then((d) => { setRecords(d.records ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const counts: { [key: string]: number } = {}
  for (const s of STATUSES) counts[s] = records.filter((r) => r.status === s).length
  const filtered = records.filter((r) => r.status === tab)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-600 p-6 text-white shadow-md">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-white/15 p-3 backdrop-blur">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">Probation Tracker</h1>
            <p className="text-white/85 mt-1 text-sm">
              Full lifecycle: settling check-in, decision packet, manager + HR review, outcome enactment.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-white border border-slate-200 rounded-lg p-1 inline-flex flex-wrap">
          {STATUSES.map((s) => (
            <TabsTrigger key={s} value={s}>
              {s.replace('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
              <span className="ml-2 text-xs text-slate-500">{counts[s]}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {STATUSES.map((s) => (
          <TabsContent key={s} value={s} className="mt-4">
            <Card className="rounded-xl border-slate-200 overflow-hidden shadow-sm">
              {loading ? (
                <div className="p-8 text-center text-slate-500">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-slate-500">No records.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Manager</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Ends</TableHead>
                      <TableHead>Days Left</TableHead>
                      <TableHead>Warnings</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => {
                      const dl = daysLeft(r.endDate)
                      const tone = dl < 14 ? 'text-rose-700 font-semibold' : dl < 30 ? 'text-amber-700 font-semibold' : 'text-slate-700'
                      return (
                        <TableRow key={r.id}>
                          <TableCell>
                            <div className="font-medium text-slate-900">{r.employee.fullName}</div>
                            <div className="text-xs text-slate-500">{r.employee.employeeCode} · {r.employee.designation}</div>
                          </TableCell>
                          <TableCell className="text-sm text-slate-700">{r.employee.reportingManager?.fullName ?? '—'}</TableCell>
                          <TableCell className="text-sm text-slate-700">{new Date(r.startDate).toLocaleDateString('en-GB')}</TableCell>
                          <TableCell className="text-sm text-slate-700">{new Date(r.endDate).toLocaleDateString('en-GB')}</TableCell>
                          <TableCell className={`text-sm ${tone}`}>{dl} days</TableCell>
                          <TableCell>
                            {r.warningCount > 0 ? (
                              <span className="inline-flex items-center gap-1 text-orange-700 text-xs font-semibold">
                                <AlertTriangle className="w-3 h-3" />{r.warningCount}
                              </span>
                            ) : <span className="text-slate-400 text-xs">—</span>}
                          </TableCell>
                          <TableCell>
                            <Link href={`/dashboard/probation/${r.id}`} className="text-blue-600 hover:underline text-sm font-medium">View →</Link>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <p className="text-xs text-slate-400">
        Status badges:{' '}
        {STATUSES.map((s) => (
          <Badge key={s} variant="outline" className={`mr-1 ${STATUS_TONE[s]}`}>{s}</Badge>
        ))}
      </p>
    </div>
  )
}
