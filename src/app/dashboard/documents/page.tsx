'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Upload, FileText, ExternalLink } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface Employee { id: string; fullName: string; employeeCode: string }
interface Document { id: string; name: string; type: string; url: string; createdAt: string; size: number | null }
interface PolicyDoc { id: string; title: string; type: string; version: string | null; effectiveDate: string | null; acknowledgments: { status: string }[] }

export default function DocumentsPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selectedEmp, setSelectedEmp] = useState('')
  const [docs, setDocs] = useState<Document[]>([])
  const [policies, setPolicies] = useState<PolicyDoc[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/employees?limit=200')
      .then((r) => r.json())
      .then((d) => setEmployees(d.employees ?? []))
    fetch('/api/documents/policies')
      .then((r) => r.json())
      .then((d) => setPolicies(d.policies ?? []))
  }, [])

  const fetchDocs = useCallback(async () => {
    if (!selectedEmp) return
    setLoading(true)
    const res = await fetch(`/api/documents?employeeId=${selectedEmp}`)
    const data = await res.json()
    setDocs(data.documents ?? [])
    setLoading(false)
  }, [selectedEmp])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  const docsByType = docs.reduce<Record<string, Document[]>>((acc, doc) => {
    if (!acc[doc.type]) acc[doc.type] = []
    acc[doc.type].push(doc)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Documents</h1>

      {/* Employee Selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="min-w-[280px]">
              <label className="block text-xs font-medium text-gray-500 mb-1">Select Employee</label>
              <Select value={selectedEmp} onValueChange={setSelectedEmp}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an employee…" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedEmp && (
              <Button size="sm" variant="outline" className="mt-4">
                <Upload className="w-4 h-4" />
                Upload Document
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Employee Documents */}
      {selectedEmp && (
        <div className="space-y-4">
          {loading ? (
            <p className="text-center py-8 text-gray-400">Loading…</p>
          ) : Object.keys(docsByType).length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-gray-400">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No documents found for this employee.
              </CardContent>
            </Card>
          ) : (
            Object.entries(docsByType).map(([type, typeDocs]) => (
              <Card key={type}>
                <CardHeader><CardTitle>{type.replace(/_/g, ' ')}</CardTitle></CardHeader>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {typeDocs.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">{doc.name}</TableCell>
                        <TableCell className="text-gray-500">{doc.size ? `${Math.round(doc.size / 1024)} KB` : '—'}</TableCell>
                        <TableCell>{formatDate(doc.createdAt)}</TableCell>
                        <TableCell>
                          <a href={doc.url} target="_blank" rel="noreferrer">
                            <Button size="sm" variant="ghost">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                          </a>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Policy Documents */}
      <Card>
        <CardHeader><CardTitle>Policy Documents</CardTitle></CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Effective Date</TableHead>
              <TableHead>Acknowledgments</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {policies.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-gray-400">No policy documents.</TableCell></TableRow>
            ) : (
              policies.map((p) => {
                const signed = p.acknowledgments.filter((a) => a.status === 'SIGNED').length
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.title}</TableCell>
                    <TableCell><Badge variant="secondary">{p.type.replace(/_/g, ' ')}</Badge></TableCell>
                    <TableCell>{p.version ?? '—'}</TableCell>
                    <TableCell>{p.effectiveDate ? formatDate(p.effectiveDate) : '—'}</TableCell>
                    <TableCell>
                      <span className="text-sm">{signed}/{p.acknowledgments.length} signed</span>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost"><ExternalLink className="w-3.5 h-3.5" /></Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
