'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { DoorOpen, Info } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface Clearance {
  id: string
  status: string
  initiatedAt: string
  lastWorkingDay: string | null
  itCleared: boolean
  financeCleared: boolean
  adminCleared: boolean
  hrCleared: boolean
  duesCleared: boolean
  employeeAcknowledged: boolean
  hrCertifiedAt: string | null
  interviewCompletedAt: string | null
  handoverSignedAt: string | null
  handoverSignedByMgr: boolean
  triggerType: string
  terminationId: string | null
  employee: { id: string; fullName: string; employeeCode: string; designation: string; status: string }
}

const TRIGGER_LABEL: Record<string, string> = {
  RESIGNATION: 'Resignation',
  TERMINATION: 'Termination',
  LAYOFF: 'Layoff',
  OTHER: 'Other',
}

// Same 6 completion gates the detail page (and the COMPLETE API action) use.
function sectionsDone(c: Clearance): number {
  return [
    c.itCleared && c.financeCleared && c.adminCleared && c.hrCleared,
    c.duesCleared,
    c.employeeAcknowledged,
    !!c.hrCertifiedAt,
    !!c.interviewCompletedAt,
    !!c.handoverSignedAt && c.handoverSignedByMgr,
  ].filter(Boolean).length
}

export default function ExitClearanceClient() {
  const [clearances, setClearances] = useState<Clearance[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/exit-clearance')
      .then((r) => r.json())
      .then((d) => { setClearances(d.clearances ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const now = Date.now()
  const sorted = [...clearances].sort((a, b) => {
    // In-progress first (oldest initiation first — most aged on top), completed last.
    const rank = (c: Clearance) => (c.status === 'COMPLETED' ? 1 : 0)
    const r = rank(a) - rank(b)
    if (r !== 0) return r
    return rank(a) === 0
      ? new Date(a.initiatedAt).getTime() - new Date(b.initiatedAt).getTime()
      : new Date(b.initiatedAt).getTime() - new Date(a.initiatedAt).getTime()
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Exit Clearance</h1>
        <p className="text-sm text-slate-500 mt-1">Track departing employees through the 7-section clearance workflow.</p>
      </div>

      <Card>
        <CardHeader className="border-b border-slate-100">
          <CardTitle>Active Clearances</CardTitle>
          <div className="flex items-start gap-2 mt-2 rounded-md bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-900">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <p>
              Clearances open automatically from a resignation or a termination handoff. Click a row to work through the
              7-section checklist — departmental sign-offs, settlement, acknowledgment, certification, exit interview and handover.
            </p>
          </div>
        </CardHeader>
        {loading ? (
          <CardContent className="py-8 text-center text-slate-400">Loading…</CardContent>
        ) : sorted.length === 0 ? (
          <CardContent className="py-10 text-center text-slate-400">
            <DoorOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
            No exit clearances in progress.
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Last Working Day</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Aging</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((c) => {
                const done = sectionsDone(c)
                const agingDays = Math.floor((now - new Date(c.initiatedAt).getTime()) / 86400000)
                const isAged = c.status !== 'COMPLETED' && agingDays > 14
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/dashboard/lifecycle/exit/${c.id}`} className="font-medium text-slate-900 hover:text-slate-700 hover:underline">
                        {c.employee.fullName}
                      </Link>
                      <p className="text-xs text-slate-500">{c.employee.employeeCode} · {c.employee.designation}</p>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {TRIGGER_LABEL[c.triggerType] ?? c.triggerType}
                      {c.terminationId && (
                        <div>
                          <Link href={`/dashboard/lifecycle/termination/${c.terminationId}`} className="text-[11px] underline underline-offset-2 text-slate-500 hover:text-slate-800" title="Open the originating termination workflow">
                            view termination
                          </Link>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{c.lastWorkingDay ? formatDate(c.lastWorkingDay) : '—'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-slate-600 rounded-full" style={{ width: `${(done / 6) * 100}%` }} />
                        </div>
                        <span className="text-xs text-slate-600 tabular-nums">{done}/6</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs tabular-nums ${isAged ? 'font-semibold text-slate-800' : 'text-slate-500'}`} title={`Initiated ${formatDate(c.initiatedAt)}`}>
                        {c.status === 'COMPLETED' ? '—' : agingDays === 0 ? 'Today' : `${agingDays}d${isAged ? ' · aging' : ''}`}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.status === 'COMPLETED' ? 'success' : 'default'}>{c.status.replace('_', ' ')}</Badge>
                    </TableCell>
                    <TableCell>
                      <Link href={`/dashboard/lifecycle/exit/${c.id}`} className="text-slate-700 hover:underline text-sm font-medium" title="Open the clearance checklist">
                        Open →
                      </Link>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
