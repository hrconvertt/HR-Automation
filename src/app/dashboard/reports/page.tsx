'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'

type ReportRow = Record<string, string | number>

const REPORT_TYPES = [
  { value: 'employee_list', label: 'Employee List' },
  { value: 'attendance_summary', label: 'Attendance Summary' },
  { value: 'leave_summary', label: 'Leave Summary' },
  { value: 'payroll_summary', label: 'Payroll Summary' },
  { value: 'headcount', label: 'Headcount by Department' },
]

export default function ReportsPage() {
  const [reportType, setReportType] = useState('employee_list')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [data, setData] = useState<ReportRow[]>([])
  const [columns, setColumns] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  async function handleGenerate() {
    setLoading(true)
    const params = new URLSearchParams({ type: reportType, from: fromDate, to: toDate })
    const res = await fetch(`/api/reports?${params}`)
    const result = await res.json()
    setData(result.data ?? [])
    setColumns(result.columns ?? [])
    setLoading(false)
  }

  function handleExcelExport() {
    if (data.length === 0) return
    import('xlsx').then((XLSX) => {
      const ws = XLSX.utils.json_to_sheet(data)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Report')
      XLSX.writeFile(wb, `${reportType}_${new Date().toISOString().slice(0, 10)}.xlsx`)
    })
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Reports</h1>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="min-w-[200px]">
              <label className="block text-xs font-medium text-gray-500 mb-1">Report Type</label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_TYPES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">From Date</label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">To Date</label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40" />
            </div>
            <Button onClick={handleGenerate} disabled={loading}>
              {loading ? 'Generating…' : 'Generate'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {data.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Preview ({data.length} rows)</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleExcelExport}>
                  <FileSpreadsheet className="w-4 h-4" />
                  Export Excel
                </Button>
                <Button size="sm" variant="outline">
                  <FileText className="w-4 h-4" />
                  Export PDF
                </Button>
              </div>
            </div>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c}>{c.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.slice(0, 50).map((row, i) => (
                <TableRow key={i}>
                  {columns.map((c) => (
                    <TableCell key={c}>{row[c] ?? '—'}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {data.length > 50 && (
            <div className="px-4 py-3 text-sm text-gray-500 border-t border-gray-100">
              Showing 50 of {data.length} rows. Export to see all.
            </div>
          )}
        </Card>
      )}

      {!loading && data.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Download className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Select a report type and click Generate to preview data.</p>
        </div>
      )}
    </div>
  )
}
