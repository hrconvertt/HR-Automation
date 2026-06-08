'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { AlertTriangle } from 'lucide-react'

export interface ProbationListItem {
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

function daysLeft(endIso: string): number {
  return Math.floor((new Date(endIso).getTime() - Date.now()) / 86_400_000)
}

export function ProbationTrackerTabs({ records }: { records: ProbationListItem[] }) {
  const [tab, setTab] = useState<string>('ACTIVE')

  const counts: { [key: string]: number } = {}
  for (const s of STATUSES) counts[s] = records.filter((r) => r.status === s).length

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="bg-white border border-slate-200 rounded-lg p-1 inline-flex flex-wrap">
        {STATUSES.map((s) => (
          <TabsTrigger key={s} value={s}>
            {s.replace('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
            <span className="ml-2 text-xs text-slate-500">{counts[s]}</span>
          </TabsTrigger>
        ))}
      </TabsList>

      {STATUSES.map((s) => {
        const filtered = records.filter((r) => r.status === s)
        return (
          <TabsContent key={s} value={s} className="mt-4 transition-opacity duration-150">
            <Card className="rounded-xl border-slate-200 overflow-hidden shadow-sm">
              {filtered.length === 0 ? (
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
                        <TableRow key={r.id} className="hover:bg-slate-50 transition-colors">
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
                            <Link
                              href={`/dashboard/probation/${r.id}`}
                              prefetch
                              className="inline-block text-blue-600 hover:underline text-sm font-medium hover:translate-x-0.5 transition-transform"
                            >
                              View →
                            </Link>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>
        )
      })}
    </Tabs>
  )
}
