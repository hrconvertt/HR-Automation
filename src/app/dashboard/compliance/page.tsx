'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Shield, FileText, Download } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface ComplianceReport {
  id: string
  type: string
  month: number
  year: number
  status: string
  fileUrl: string | null
  submittedAt: string | null
  createdAt: string
}

const COMPLIANCE_TYPES = [
  { type: 'EOBI', label: 'EOBI', desc: 'Employees Old-Age Benefits Institution', color: 'text-slate-700', bg: 'bg-slate-50' },
  { type: 'FBR_WITHHOLDING', label: 'FBR Withholding', desc: 'Federal Board of Revenue Tax', color: 'text-slate-700', bg: 'bg-slate-50' },
  { type: 'PSEB', label: 'PSEB', desc: 'Pakistan Software Export Board', color: 'text-slate-700', bg: 'bg-slate-50' },
  { type: 'SOCIAL_SECURITY', label: 'Social Security', desc: 'Provincial Social Security Contributions', color: 'text-slate-700', bg: 'bg-slate-50' },
]

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function CompliancePage() {
  const now = new Date()
  const [reports, setReports] = useState<ComplianceReport[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)

  const fetchReports = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/compliance')
    const data = await res.json()
    setReports(data.reports ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchReports() }, [fetchReports])

  async function handleGenerate(type: string) {
    setGenerating(type)
    const res = await fetch('/api/compliance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, month: now.getMonth() + 1, year: now.getFullYear() }),
    })
    setGenerating(null)
    if (res.ok) fetchReports()
    else alert('Failed to generate report')
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Compliance</h1>

      {/* Compliance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {COMPLIANCE_TYPES.map((ct) => {
          const latestReport = reports.filter((r) => r.type === ct.type).sort((a, b) => b.year - a.year || b.month - a.month)[0]
          return (
            <Card key={ct.type}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2 rounded-lg ${ct.bg}`}>
                    <Shield className={`w-5 h-5 ${ct.color}`} />
                  </div>
                  {latestReport && (
                    <Badge variant={latestReport.status === 'SUBMITTED' ? 'success' : latestReport.status === 'GENERATED' ? 'default' : 'warning'}>
                      {latestReport.status}
                    </Badge>
                  )}
                </div>
                <p className="font-semibold text-gray-900">{ct.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{ct.desc}</p>
                {latestReport && (
                  <p className="text-xs text-gray-400 mt-1">
                    Last: {months[latestReport.month - 1]} {latestReport.year}
                  </p>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 w-full"
                  onClick={() => handleGenerate(ct.type)}
                  disabled={generating === ct.type}
                >
                  <FileText className="w-3.5 h-3.5" />
                  {generating === ct.type ? 'Generating…' : 'Generate Report'}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Reports History */}
      <Card>
        <CardHeader><CardTitle>Report History</CardTitle></CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Generated</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-gray-400">Loading…</TableCell></TableRow>
            ) : reports.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-gray-400">No reports generated yet.</TableCell></TableRow>
            ) : (
              reports.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><Badge variant="secondary">{r.type.replace(/_/g, ' ')}</Badge></TableCell>
                  <TableCell>{months[r.month - 1]} {r.year}</TableCell>
                  <TableCell>{formatDate(r.createdAt)}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === 'SUBMITTED' ? 'success' : r.status === 'GENERATED' ? 'default' : 'warning'}>
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{r.submittedAt ? formatDate(r.submittedAt) : '—'}</TableCell>
                  <TableCell>
                    {r.fileUrl && (
                      <a href={r.fileUrl} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="ghost"><Download className="w-3.5 h-3.5" /></Button>
                      </a>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
