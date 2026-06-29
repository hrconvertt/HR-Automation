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
  employee: { id: string; fullName: string; employeeCode: string; designation: string; status: string }
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
              Employees appear here automatically when their status changes to{' '}
              <span className="font-medium">Resigned</span>, <span className="font-medium">Terminated</span>, or{' '}
              <span className="font-medium">Laid Off</span>. Update status from the{' '}
              <Link href="/dashboard/employees" className="underline font-medium">People module</Link>.
            </p>
          </div>
        </CardHeader>
        {loading ? (
          <CardContent className="py-8 text-center text-slate-400">Loading…</CardContent>
        ) : clearances.length === 0 ? (
          <CardContent className="py-10 text-center text-slate-400">
            <DoorOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
            No exit clearances in progress.
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Last Working Day</TableHead>
                <TableHead>Clearances</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clearances.map((c) => {
                const totalClear = [c.itCleared, c.financeCleared, c.adminCleared, c.hrCleared].filter(Boolean).length
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <p className="font-medium">{c.employee.fullName}</p>
                      <p className="text-xs text-slate-500">{c.employee.employeeCode} · {c.employee.designation}</p>
                    </TableCell>
                    <TableCell>{c.lastWorkingDay ? formatDate(c.lastWorkingDay) : '—'}</TableCell>
                    <TableCell>{totalClear}/4 cleared</TableCell>
                    <TableCell>
                      <Badge variant={c.status === 'COMPLETED' ? 'success' : 'default'}>{c.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Link href={`/dashboard/employees/${c.employee.id}`} className="text-slate-700 hover:underline text-sm font-medium">
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
