'use client'

import { useState, useCallback, useRef } from 'react'
import { EmailLink, PhoneLink } from '@/components/ui/contact-link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Upload, FileText, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronUp, Sparkles, Trash2, UserCheck, UserX, Minus } from 'lucide-react'

interface RequisitionOption {
  id: string
  title: string
}

interface CandidateResult {
  filename: string
  status: 'success' | 'error'
  candidate?: {
    id: string
    fullName: string
    email: string
    phone?: string
    location?: string
    currentCompany?: string
    currentRole?: string
    totalExperienceYears?: number
    education?: string
    skills?: string[]
    matchScore?: number
    recommendation?: string
    summary?: string
    knockoutStatus?: string
    knockoutEvaluation?: {
      passed?: boolean
      failures?: string[]
      details?: string
    }
    scoreBreakdown?: {
      experienceMatch?: number
      skillsMatch?: number
      educationMatch?: number
      locationMatch?: number
      overallNotes?: string
    }
  }
  error?: string
}

interface UploadResponse {
  total: number
  success: number
  errors: number
  autoTalentPool: number
  aiScored?: boolean
  results: CandidateResult[]
}

function scoreColor(score: number | undefined | null): string {
  if (score == null) return 'text-slate-400'
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-yellow-600'
  if (score >= 40) return 'text-orange-500'
  return 'text-red-500'
}

function scoreBg(score: number | undefined | null): string {
  if (score == null) return 'bg-slate-100'
  if (score >= 80) return 'bg-green-50 border-green-200'
  if (score >= 60) return 'bg-yellow-50 border-yellow-200'
  if (score >= 40) return 'bg-orange-50 border-orange-200'
  return 'bg-red-50 border-red-200'
}

function recommendationIcon(rec: string | undefined) {
  if (rec === 'STRONG_MATCH' || rec === 'MATCH') return <UserCheck className="w-3.5 h-3.5 text-green-600" />
  if (rec === 'REJECT') return <UserX className="w-3.5 h-3.5 text-red-500" />
  return <Minus className="w-3.5 h-3.5 text-slate-400" />
}

export function BulkResumeUpload({ openRequisitions }: { openRequisitions: RequisitionOption[] }) {
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [selectedReqId, setSelectedReqId] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState<UploadResponse | null>(null)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)

  const handleFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return
    const validFiles = Array.from(newFiles).filter(
      (f) => /\.(pdf|docx?|txt)$/i.test(f.name)
    )
    setFiles((prev) => [...prev, ...validFiles].slice(0, 50))
  }, [])

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  const upload = async () => {
    if (files.length === 0 || !selectedReqId) return
    setUploading(true)
    setResults(null)

    try {
      const formData = new FormData()
      files.forEach((f) => formData.append('files', f))
      formData.append('requisitionId', selectedReqId)

      const res = await fetch('/api/recruiting/bulk-candidates/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (data.error) {
        setResults({ total: 0, success: 0, errors: 1, autoTalentPool: 0, results: [{ filename: 'Upload', status: 'error', error: data.error }] })
      } else {
        setResults(data)
      }
    } catch {
      setResults({ total: 0, success: 0, errors: 1, autoTalentPool: 0, results: [{ filename: 'Upload', status: 'error', error: 'Network error' }] })
    } finally {
      setUploading(false)
    }
  }

  const reset = () => {
    setFiles([])
    setResults(null)
    setExpandedIdx(null)
  }

  const selectedReq = openRequisitions.find((r) => r.id === selectedReqId)

  // Score distribution
  const scoreBuckets = results
    ? {
        strong: results.results.filter((r) => r.candidate?.matchScore != null && r.candidate.matchScore >= 70).length,
        possible: results.results.filter((r) => r.candidate?.matchScore != null && r.candidate.matchScore >= 50 && r.candidate.matchScore < 70).length,
        weak: results.results.filter((r) => r.candidate?.matchScore != null && r.candidate.matchScore < 50).length,
        failed: results.results.filter((r) => r.candidate?.knockoutStatus === 'FAILED').length,
      }
    : null

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Upload className="w-3.5 h-3.5" />
          Bulk Screen Resumes
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-slate-500" />
            Bulk Resume Screening & AI Scoring
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1: Select requisition */}
          {results === null && (
            <>
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5 block">
                  Screen against which position?
                </label>
                <Select value={selectedReqId} onValueChange={setSelectedReqId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a job requisition..." />
                  </SelectTrigger>
                  <SelectContent>
                    {openRequisitions.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
                  Drop resume files here or click to browse
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  PDF, DOCX, TXT · Max 50 files · Max 10MB each
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.txt"
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
              </div>

              {/* File list */}
              {files.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                    {files.length} resume{files.length !== 1 ? 's' : ''} for: <span className="text-slate-900">{selectedReq?.title || '—'}</span>
                  </p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm bg-slate-50 rounded-lg px-3 py-1.5">
                        <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span className="text-slate-700 truncate flex-1">{f.name}</span>
                        <span className="text-[11px] text-slate-400">{(f.size / 1024).toFixed(0)}KB</span>
                        <button onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button onClick={upload} disabled={uploading || !selectedReqId} className="w-full gap-2">
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Screening with AI... ~30-60 seconds per resume
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Upload & Screen Resumes
                      </>
                    )}
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Step 2: Results */}
          {results && scoreBuckets && (
            <>
              {/* Summary */}
              <div className="grid grid-cols-4 gap-2">
                <div className="rounded-lg border bg-green-50 border-green-200 p-3 text-center">
                  <p className="text-xs text-green-600 font-semibold uppercase">Strong Match</p>
                  <p className="text-2xl font-bold text-green-700 tabular-nums">{scoreBuckets.strong}</p>
                  <p className="text-[10px] text-green-500">Score ≥ 70</p>
                </div>
                <div className="rounded-lg border bg-yellow-50 border-yellow-200 p-3 text-center">
                  <p className="text-xs text-yellow-600 font-semibold uppercase">Possible</p>
                  <p className="text-2xl font-bold text-yellow-700 tabular-nums">{scoreBuckets.possible}</p>
                  <p className="text-[10px] text-yellow-500">Score 50-69</p>
                </div>
                <div className="rounded-lg border bg-orange-50 border-orange-200 p-3 text-center">
                  <p className="text-xs text-orange-600 font-semibold uppercase">Weak</p>
                  <p className="text-2xl font-bold text-orange-700 tabular-nums">{scoreBuckets.weak}</p>
                  <p className="text-[10px] text-orange-500">Score &lt; 50</p>
                </div>
                <div className="rounded-lg border bg-red-50 border-red-200 p-3 text-center">
                  <p className="text-xs text-red-600 font-semibold uppercase">Knockout Fail</p>
                  <p className="text-2xl font-bold text-red-700 tabular-nums">{scoreBuckets.failed}</p>
                  <p className="text-[10px] text-red-500">Auto-filtered</p>
                </div>
              </div>

              {results.aiScored === false && results.success > 0 && (
                <div className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <span className="text-amber-800">
                    Uploaded without AI scoring (no Anthropic API key set). Candidates were added with name, email and phone for manual review. Set <strong>ANTHROPIC_API_KEY</strong> in Vercel to enable match scores.
                  </span>
                </div>
              )}

              {results.autoTalentPool > 0 && (
                <div className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <Sparkles className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-slate-600">
                    <strong>{results.autoTalentPool}</strong> candidates auto-added to Talent Pool (score ≥ 60)
                  </span>
                </div>
              )}

              {/* Candidate list */}
              <div className="space-y-1.5 max-h-[45vh] overflow-y-auto">
                {results.results.map((r, idx) => (
                  <div key={idx}>
                    {r.status === 'error' ? (
                      <div className="flex items-start gap-2 p-2.5 rounded-lg border border-red-100 bg-red-50">
                        <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-red-700">{r.filename}</p>
                          <p className="text-xs text-red-600">{r.error}</p>
                        </div>
                      </div>
                    ) : r.candidate ? (
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <button
                          className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50"
                          onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                        >
                          {/* Score badge */}
                          <div className={`w-12 h-12 rounded-full border-2 flex flex-col items-center justify-center flex-shrink-0 ${scoreBg(r.candidate.matchScore)}`}>
                            <span className={`text-sm font-bold tabular-nums leading-none ${scoreColor(r.candidate.matchScore)}`}>
                              {r.candidate.matchScore != null ? Math.round(r.candidate.matchScore) : '?'}
                            </span>
                            <span className="text-[8px] text-slate-400 leading-none mt-0.5">SCORE</span>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium text-slate-900 truncate">{r.candidate.fullName}</p>
                              {recommendationIcon(r.candidate.recommendation)}
                            </div>
                            <p className="text-[11px] text-slate-500 truncate">
                              {r.candidate.currentRole && `${r.candidate.currentRole}`}
                              {r.candidate.currentCompany && r.candidate.currentRole ? ' at ' : ''}
                              {r.candidate.currentCompany}
                              {(!r.candidate.currentRole && !r.candidate.currentCompany) && r.candidate.email}
                            </p>
                          </div>

                          {/* Tags */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {r.candidate.knockoutStatus === 'FAILED' && (
                              <Badge variant="destructive" className="text-[9px]">KNOCKOUT</Badge>
                            )}
                            {r.candidate.totalExperienceYears != null && (
                              <Badge variant="secondary" className="text-[9px]">{r.candidate.totalExperienceYears}y exp</Badge>
                            )}
                            {expandedIdx === idx ? (
                              <ChevronUp className="w-4 h-4 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                        </button>

                        {expandedIdx === idx && (
                          <div className="border-t border-slate-100 p-3 bg-slate-50/50 space-y-2">
                            {/* Contact */}
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              {r.candidate.email && <div><span className="text-slate-500">Email:</span> <EmailLink value={r.candidate.email} className="text-slate-700" /></div>}
                              {r.candidate.phone && <div><span className="text-slate-500">Phone:</span> <PhoneLink value={r.candidate.phone} className="text-slate-700" /></div>}
                              {r.candidate.location && <div><span className="text-slate-500">Location:</span> <span className="text-slate-700">{r.candidate.location}</span></div>}
                              {r.candidate.education && <div><span className="text-slate-500">Education:</span> <span className="text-slate-700">{r.candidate.education}</span></div>}
                            </div>

                            {/* Skills */}
                            {r.candidate.skills && r.candidate.skills.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {r.candidate.skills.map((s, i) => (
                                  <Badge key={i} variant="secondary" className="text-[10px]">{s}</Badge>
                                ))}
                              </div>
                            )}

                            {/* Score breakdown */}
                            {r.candidate.scoreBreakdown && (
                              <div className="grid grid-cols-4 gap-1">
                                {(['experienceMatch', 'skillsMatch', 'educationMatch', 'locationMatch'] as const).map((key) => {
                                  const val = r.candidate?.scoreBreakdown?.[key]
                                  return (
                                    <div key={key} className="text-center">
                                      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full rounded-full ${typeof val === 'number' && val >= 7 ? 'bg-green-500' : typeof val === 'number' && val >= 5 ? 'bg-yellow-500' : 'bg-red-400'}`}
                                          style={{ width: `${(typeof val === 'number' ? val : 0) * 10}%` }}
                                        />
                                      </div>
                                      <p className="text-[9px] text-slate-500 mt-0.5">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                            {/* Knockout failures */}
                            {r.candidate.knockoutEvaluation?.failures && r.candidate.knockoutEvaluation.failures.length > 0 && (
                              <div className="rounded bg-red-50 border border-red-100 p-2">
                                <p className="text-[11px] text-red-600 font-semibold">Knockout Failures:</p>
                                {r.candidate.knockoutEvaluation.failures.map((f, i) => (
                                  <p key={i} className="text-[11px] text-red-700">· {f}</p>
                                ))}
                              </div>
                            )}

                            {/* Summary */}
                            {r.candidate.summary && (
                              <p className="text-xs text-slate-600 italic">{r.candidate.summary}</p>
                            )}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2 border-t">
                <Button variant="outline" size="sm" onClick={reset} className="gap-1.5">
                  Upload More
                </Button>
                <Button variant="outline" size="sm" onClick={() => { reset(); setOpen(false) }}>
                  Done
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
