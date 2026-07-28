'use client'

import { useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Upload, FileText, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronUp, Sparkles, AlertTriangle, Trash2 } from 'lucide-react'

interface ParsedJD {
  title: string
  department?: string
  positionLevel?: string
  type?: string
  vacancies?: number
  description?: string
  requirements?: string
  salaryMin?: number | null
  salaryMax?: number | null
  salaryCurrency?: string
  minExperienceYears?: number | null
  requiredSkills?: string[]
  preferredSkills?: string[]
  education?: string
  location?: string
  onsiteRequired?: boolean
  knockoutCriteria?: Array<{ type: string; value: string; isHard: boolean; label: string }>
  interviewRubrics?: Array<{ skillName: string; description?: string }>
  screeningQuestions?: string[]
  rawText?: string
  sourceFile?: string
}

interface UploadResult {
  filename: string
  status: 'success' | 'error'
  jd?: ParsedJD
  rawText?: string
  error?: string
}

export function BulkJDUpload() {
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState<UploadResult[]>([])
  const [confirmed, setConfirmed] = useState<string[]>([])
  const [confirming, setConfirming] = useState(false)
  const [confirmResults, setConfirmResults] = useState<Array<{ title: string; status: string; requisitionId?: string; error?: string }>>([])
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)

  const handleFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return
    const pdfFiles = Array.from(newFiles).filter(
      (f) => /\.(pdf|docx?|txt|md)$/i.test(f.name)
    )
    setFiles((prev) => [...prev, ...pdfFiles].slice(0, 20))
  }, [])

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  const upload = async () => {
    if (files.length === 0) return
    setUploading(true)
    setResults([])
    setConfirmed([])
    setConfirmResults([])

    try {
      const formData = new FormData()
      files.forEach((f) => formData.append('files', f))

      const res = await fetch('/api/recruiting/bulk-jd/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (data.error) {
        setResults([{ filename: 'Upload', status: 'error', error: data.error }])
      } else {
        setResults(data.results || [])
        // Auto-select all successful ones
        setConfirmed((data.results || []).filter((r: UploadResult) => r.status === 'success').map((r: UploadResult) => r.filename))
      }
    } catch (err) {
      setResults([{ filename: 'Upload', status: 'error', error: 'Network error' }])
    } finally {
      setUploading(false)
    }
  }

  const confirmSelected = async () => {
    const selectedJDs = results
      .filter((r) => r.status === 'success' && r.jd && confirmed.includes(r.filename))
      .map((r) => r.jd!)

    if (selectedJDs.length === 0) return
    setConfirming(true)

    try {
      const res = await fetch('/api/recruiting/bulk-jd/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jds: selectedJDs }),
      })

      const data = await res.json()
      setConfirmResults(data.results || [])

      // Reset after 2 seconds
      setTimeout(() => {
        setFiles([])
        setResults([])
        setConfirmed([])
        setConfirmResults([])
        setOpen(false)
      }, 3000)
    } catch {
      setConfirmResults([{ title: 'Confirm', status: 'error', error: 'Network error' }])
    } finally {
      setConfirming(false)
    }
  }

  const toggleConfirm = (filename: string) => {
    setConfirmed((prev) =>
      prev.includes(filename)
        ? prev.filter((f) => f !== filename)
        : [...prev, filename]
    )
  }

  const successCount = results.filter((r) => r.status === 'success').length
  const errorCount = results.filter((r) => r.status === 'error').length

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Upload className="w-3.5 h-3.5" />
          Bulk Upload JDs
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-slate-500" />
            Bulk JD Upload & AI Parsing
          </DialogTitle>
        </DialogHeader>

        {confirmResults.length > 0 ? (
          <div className="space-y-3">
            <div className="text-center py-4">
              <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-900">
                {confirmResults.filter((r) => r.status === 'created').length} requisition(s) created!
              </p>
              {confirmResults.some((r) => r.status === 'error') && (
                <p className="text-xs text-red-500 mt-1">
                  {confirmResults.filter((r) => r.status === 'error').length} failed
                </p>
              )}
            </div>
          </div>
        ) : results.length === 0 ? (
          /* Step 1: Upload files */
          <div className="space-y-4">
            {/* Drop zone */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                dragActive
                  ? 'border-slate-400 bg-slate-50'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files) }}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-8 h-8 text-slate-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-700">
                Drop JD files here or click to browse
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Supports PDF, DOCX, TXT · Max 20 files · Max 10MB each
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt,.md"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  {files.length} file{files.length !== 1 ? 's' : ''} selected
                </p>
                <div className="space-y-1">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm bg-slate-50 rounded-lg px-3 py-2">
                      <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span className="text-slate-700 truncate flex-1">{f.name}</span>
                      <span className="text-[11px] text-slate-400">{(f.size / 1024).toFixed(0)}KB</span>
                      <button onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button onClick={upload} disabled={uploading} className="w-full gap-2">
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Parsing with AI... This may take 30-60 seconds per file
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Upload & Parse JDs
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        ) : (
          /* Step 2: Review & Confirm */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">
                Parsed Results
              </p>
              <div className="flex items-center gap-2">
                {successCount > 0 && <Badge variant="success">{successCount} parsed</Badge>}
                {errorCount > 0 && <Badge variant="destructive">{errorCount} errors</Badge>}
              </div>
            </div>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {results.map((r, idx) => (
                <div key={idx}>
                  {r.status === 'error' ? (
                    <div className="flex items-start gap-2 p-3 rounded-lg border border-red-100 bg-red-50">
                      <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-red-700">{r.filename}</p>
                        <p className="text-xs text-red-600">{r.error}</p>
                      </div>
                    </div>
                  ) : r.jd ? (
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <button
                        className="w-full flex items-center gap-2 p-3 text-left hover:bg-slate-50"
                        onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                      >
                        <input
                          type="checkbox"
                          checked={confirmed.includes(r.filename)}
                          onChange={() => toggleConfirm(r.filename)}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded"
                        />
                        <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{r.jd.title}</p>
                          <p className="text-[11px] text-slate-500">
                            {r.jd.department && `${r.jd.department} · `}
                            {r.jd.type?.replace(/_/g, ' ') || 'FULL_TIME'}
                            {r.jd.minExperienceYears != null && ` · ${r.jd.minExperienceYears}+ yrs`}
                            {r.jd.salaryMin != null && ` · ${r.jd.salaryCurrency || ''} ${r.jd.salaryMin?.toLocaleString()}`}
                          </p>
                        </div>
                        {expandedIdx === idx ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </button>

                      {expandedIdx === idx && (
                        <div className="border-t border-slate-100 p-4 bg-slate-50/50 space-y-3">
                          {/* Editable fields */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[11px] text-slate-500 font-medium">Title</label>
                              <Input
                                value={r.jd.title}
                                onChange={(e) => { r.jd.title = e.target.value }}
                                className="h-8 text-sm"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] text-slate-500 font-medium">Department</label>
                              <Input
                                value={r.jd.department || ''}
                                onChange={(e) => { r.jd.department = e.target.value }}
                                className="h-8 text-sm"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] text-slate-500 font-medium">Level</label>
                              <Input
                                value={r.jd.positionLevel || ''}
                                onChange={(e) => { r.jd.positionLevel = e.target.value }}
                                className="h-8 text-sm"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] text-slate-500 font-medium">Salary Range</label>
                              <Input
                                value={r.jd.salaryMin != null ? `${r.jd.salaryCurrency || 'PKR'} ${r.jd.salaryMin?.toLocaleString()} - ${r.jd.salaryMax?.toLocaleString()}` : ''}
                                onChange={(e) => {
                                  const match = e.target.value.match(/[\d,.]+/g)
                                  if (match?.[0]) r.jd.salaryMin = parseFloat(match[0].replace(/,/g, ''))
                                  if (match?.[1]) r.jd.salaryMax = parseFloat(match[1].replace(/,/g, ''))
                                }}
                                className="h-8 text-sm"
                              />
                            </div>
                          </div>

                          {/* Skills */}
                          {r.jd.requiredSkills && r.jd.requiredSkills.length > 0 && (
                            <div>
                              <label className="text-[11px] text-slate-500 font-medium">Required Skills</label>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {r.jd.requiredSkills.map((s, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Knockout criteria */}
                          {r.jd.knockoutCriteria && r.jd.knockoutCriteria.length > 0 && (
                            <div>
                              <label className="text-[11px] text-slate-500 font-medium">Auto-Generated Knockout Criteria</label>
                              <div className="space-y-1 mt-1">
                                {r.jd.knockoutCriteria.map((kc, i) => (
                                  <div key={i} className="flex items-center gap-2 text-xs bg-white rounded border border-slate-200 px-2 py-1">
                                    <Badge variant={kc.isHard ? 'destructive' : 'secondary'} className="text-[9px]">
                                      {kc.isHard ? 'HARD' : 'SOFT'}
                                    </Badge>
                                    <span className="text-slate-700">{kc.label}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Screening questions */}
                          {r.jd.screeningQuestions && r.jd.screeningQuestions.length > 0 && (
                            <div>
                              <label className="text-[11px] text-slate-500 font-medium">Suggested Screening Questions</label>
                              <ol className="mt-1 space-y-0.5">
                                {r.jd.screeningQuestions.map((q, i) => (
                                  <li key={i} className="text-xs text-slate-700">{i + 1}. {q}</li>
                                ))}
                              </ol>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            {/* Confirm button */}
            <div className="flex items-center justify-between pt-2 border-t">
              <p className="text-xs text-slate-500">
                {confirmed.length} selected · Check/uncheck to choose which to create
              </p>
              <Button
                onClick={confirmSelected}
                disabled={confirming || confirmed.length === 0}
                className="gap-2"
              >
                {confirming ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Create {confirmed.length} Requisition{confirmed.length !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
