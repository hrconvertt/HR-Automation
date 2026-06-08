'use client'

/**
 * Document Center — unified module for all document-related workflows.
 *
 *   Letters         → formal HR-issued letters (experience, salary cert, NOC, etc.)
 *   Employee Files  → uploaded files per employee (CNIC, resume, certificates, etc.)
 *   Policies        → company policy documents + acknowledgments
 */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Upload, FileText, ExternalLink, Trash2, X, Mail, FolderOpen, ShieldCheck } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface Employee { id: string; fullName: string; employeeCode: string }
interface Document {
  id: string; name: string; type: string; url?: string;
  createdAt: string; size: number | null; fileSize?: number | null;
}
interface PolicyDoc {
  id: string; title: string; type: string; version: string | null;
  effectiveDate: string | null; acknowledgments: { status: string }[]
}
interface Letter {
  id: string; letterNumber: string | null; letterType: string;
  purpose: string | null; status: string; requestedAt: string;
  employee?: { id: string; fullName: string; employeeCode: string }
}

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

const LETTER_STATUS_TONE: Record<string, 'default' | 'success' | 'warning' | 'secondary'> = {
  PENDING: 'warning',
  APPROVED: 'default',
  GENERATED: 'success',
  REJECTED: 'secondary',
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
              One place for issued letters, employee files, and company policies.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="letters">
        <TabsList className="bg-white border border-slate-200 rounded-lg p-1 inline-flex">
          <TabsTrigger value="letters"><Mail className="w-3.5 h-3.5 mr-1.5" /> Letters</TabsTrigger>
          <TabsTrigger value="files"><FileText className="w-3.5 h-3.5 mr-1.5" /> Employee Files</TabsTrigger>
          <TabsTrigger value="policies"><ShieldCheck className="w-3.5 h-3.5 mr-1.5" /> Policies</TabsTrigger>
        </TabsList>

        <TabsContent value="letters" className="mt-4 transition-opacity duration-150">
          <LettersTab />
        </TabsContent>

        <TabsContent value="files" className="mt-4 transition-opacity duration-150">
          <EmployeeFilesTab />
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

/* ─────────────────────── EMPLOYEE FILES TAB ─────────────────────── */

function EmployeeFilesTab() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selectedEmp, setSelectedEmp] = useState('')
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)

  useEffect(() => {
    fetch('/api/employees?limit=200').then((r) => r.json()).then((d) => setEmployees(d.employees ?? []))
  }, [])

  const fetchDocs = useCallback(() => {
    if (!selectedEmp) return
    setLoading(true)
    fetch(`/api/documents?employeeId=${selectedEmp}`)
      .then((r) => r.json())
      .then((d) => { setDocs(d.documents ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [selectedEmp])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  async function handleDelete(id: string) {
    if (!confirm('Delete this document?')) return
    const res = await fetch(`/api/documents/${id}/download`, { method: 'DELETE' })
    if (res.ok) fetchDocs()
  }

  return (
    <Card>
      <CardHeader className="border-b border-slate-100">
        <CardTitle>Employee Files</CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="min-w-[280px]">
            <label className="block text-xs font-medium text-slate-600 mb-1">Select Employee</label>
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

        {selectedEmp && (
          loading ? (
            <p className="py-8 text-center text-sm text-slate-400">Loading…</p>
          ) : docs.length === 0 ? (
            <div className="py-10 text-center text-slate-400">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No documents yet. Use Upload Document to add one.</p>
            </div>
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
                      <TableCell className="font-medium text-sm">{d.name}</TableCell>
                      <TableCell className="text-sm text-slate-500">{size ? `${Math.round(size / 1024)} KB` : '—'}</TableCell>
                      <TableCell className="text-sm">{formatDate(d.createdAt)}</TableCell>
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
          )
        )}
      </CardContent>

      {uploadOpen && (
        <UploadDialog
          employeeId={selectedEmp}
          onClose={() => setUploadOpen(false)}
          onDone={() => { setUploadOpen(false); fetchDocs() }}
        />
      )}
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

/* ─────────────────────── UPLOAD DIALOG ─────────────────────── */

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
