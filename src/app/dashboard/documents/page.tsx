'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Upload, FileText, ExternalLink, Trash2, X } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface Employee { id: string; fullName: string; employeeCode: string }
interface Document {
  id: string; name: string; type: string; url?: string;
  createdAt: string; size: number | null; fileSize?: number | null;
}
interface PolicyDoc { id: string; title: string; type: string; version: string | null; effectiveDate: string | null; acknowledgments: { status: string }[] }

const DOC_TYPES = [
  { value: 'CNIC', label: 'CNIC' },
  { value: 'RESUME', label: 'Resume' },
  { value: 'EDUCATIONAL_CERTIFICATE', label: 'Educational Certificate' },
  { value: 'EXPERIENCE', label: 'Experience Letter' },
  { value: 'OFFER_LETTER', label: 'Offer Letter' },
  { value: 'NDA', label: 'NDA' },
  { value: 'PHOTO', label: 'Photo' },
  { value: 'SALARY_SLIP', label: 'Salary Slip' },
  { value: 'OTHER', label: 'Other' },
]

export default function DocumentsPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selectedEmp, setSelectedEmp] = useState('')
  const [docs, setDocs] = useState<Document[]>([])
  const [policies, setPolicies] = useState<PolicyDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)

  useEffect(() => {
    fetch('/api/employees?limit=200').then((r) => r.json()).then((d) => setEmployees(d.employees ?? []))
    fetch('/api/documents/policies').then((r) => r.json()).then((d) => setPolicies(d.policies ?? []))
  }, [])

  const fetchDocs = useCallback(() => {
    if (!selectedEmp) return
    setLoading(true)
    fetch(`/api/documents?employeeId=${selectedEmp}`)
      .then((r) => r.json())
      .then((d) => { setDocs(d.documents ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [selectedEmp])

  useEffect(() => {
    if (!selectedEmp) return
    let cancelled = false
    fetch(`/api/documents?employeeId=${selectedEmp}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { setDocs(d.documents ?? []); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selectedEmp])

  async function handleDelete(id: string) {
    if (!confirm('Delete this document?')) return
    const res = await fetch(`/api/documents/${id}/download`, { method: 'DELETE' })
    if (res.ok) fetchDocs()
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Documents</h1>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="min-w-[280px]">
              <label className="block text-xs font-medium text-gray-500 mb-1">Select Employee</label>
              <Select value={selectedEmp} onValueChange={setSelectedEmp}>
                <SelectTrigger><SelectValue placeholder="Choose an employee…" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedEmp && (
              <Button size="sm" onClick={() => setUploadOpen(true)}>
                <Upload className="w-4 h-4 mr-1.5" /> Upload Document
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedEmp && (
        <Card>
          <CardHeader className="border-b border-slate-100"><CardTitle>Employee Documents ({docs.length})</CardTitle></CardHeader>
          {loading ? (
            <CardContent className="py-8 text-center text-slate-400">Loading…</CardContent>
          ) : docs.length === 0 ? (
            <CardContent className="py-10 text-center text-slate-400">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No documents yet. Use Upload Document to add one.
            </CardContent>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((d) => {
                  const size = d.fileSize ?? d.size
                  return (
                    <TableRow key={d.id}>
                      <TableCell><Badge variant="secondary">{d.type.replace(/_/g, ' ')}</Badge></TableCell>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell className="text-gray-500">{size ? `${Math.round(size / 1024)} KB` : '—'}</TableCell>
                      <TableCell>{formatDate(d.createdAt)}</TableCell>
                      <TableCell className="flex items-center gap-1">
                        <a href={`/api/documents/${d.id}/download`} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="ghost" title="View / Download">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        </a>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(d.id)} title="Delete">
                          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      <Card>
        <CardHeader className="border-b border-slate-100"><CardTitle>Policy Documents</CardTitle></CardHeader>
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
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-gray-400">No policy documents.</TableCell></TableRow>
            ) : policies.map((p) => {
              const signed = p.acknowledgments.filter((a) => a.status === 'SIGNED').length
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.title}</TableCell>
                  <TableCell><Badge variant="secondary">{p.type.replace(/_/g, ' ')}</Badge></TableCell>
                  <TableCell>{p.version ?? '—'}</TableCell>
                  <TableCell>{p.effectiveDate ? formatDate(p.effectiveDate) : '—'}</TableCell>
                  <TableCell>{signed}/{p.acknowledgments.length} signed</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      {uploadOpen && (
        <UploadDialog
          employeeId={selectedEmp}
          onClose={() => setUploadOpen(false)}
          onDone={() => { setUploadOpen(false); fetchDocs() }}
        />
      )}
    </div>
  )
}

function UploadDialog({ employeeId, onClose, onDone }: { employeeId: string; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('CNIC')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { setError('Pick a file.'); return }
    if (file.size > 5 * 1024 * 1024) { setError('File exceeds 5MB.'); return }
    setBusy(true); setError(null)
    const fd = new FormData()
    fd.append('employeeId', employeeId)
    fd.append('type', type)
    fd.append('name', name || file.name)
    fd.append('file', file)
    const res = await fetch('/api/documents', { method: 'POST', body: fd })
    setBusy(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d?.error ?? 'Upload failed.')
      return
    }
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Upload Document</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CNIC Front" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">File (PDF, JPG, PNG, DOCX · max 5MB)</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm" />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
