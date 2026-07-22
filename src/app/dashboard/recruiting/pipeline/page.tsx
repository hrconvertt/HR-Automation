'use client'
import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const STAGES = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'] as const
const STAGE_COLORS: Record<string, string> = {
  APPLIED: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  SCREENING: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  INTERVIEW: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  OFFER: 'bg-green-500/20 text-green-400 border-green-500/30',
  HIRED: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  REJECTED: 'bg-red-500/20 text-red-400 border-red-500/30',
}

interface Requisition {
  id: string
  title: string
  type: string
  status: string
  departmentId: string | null
  candidates: { id: string; stage: string; fullName: string; matchScore: number | null; email: string }[]
}

export default function PipelinePage() {
  const [requisitions, setRequisitions] = useState<Requisition[]>([])
  const [loading, setLoading] = useState(true)
  const [anonymous, setAnonymous] = useState(false)
  const [expandedReq, setExpandedReq] = useState<string | null>(null)

  useEffect(() => {
    async function fetchPipeline() {
      try {
        const res = await fetch('/api/recruiting/requisitions?status=OPEN,PAUSED')
        const data = await res.json()
        setRequisitions(data)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    fetchPipeline()
  }, [])

  // Aggregate funnel
  const funnel = STAGES.reduce((acc, stage) => {
    acc[stage] = requisitions.reduce((sum, r) => sum + r.candidates.filter(c => c.stage === stage).length, 0)
    return acc
  }, {} as Record<string, number>)
  const maxFunnel = Math.max(...Object.values(funnel), 1)

  const maskName = (name: string, email: string) => {
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase()
    return anonymous ? `Candidate ${initials}` : name
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Recruitment Pipeline</h1>
          <p className="text-sm text-gray-400 mt-1">End-to-end hiring funnel across all open positions</p>
        </div>
        <Button
          variant={anonymous ? 'default' : 'outline'} size="sm"
          onClick={() => setAnonymous(!anonymous)}
          className={anonymous ? 'bg-white text-black' : 'bg-[#141414] text-gray-400 border-[#2a2a2a] hover:bg-[#1a1a1a] hover:text-white'}
        >
          {anonymous ? '👁 Anonymous ON' : '👁 Anonymous OFF'}
        </Button>
      </div>

      {/* Funnel */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        {STAGES.filter(s => s !== 'REJECTED').map(stage => (
          <Card key={stage} className="bg-[#141414] border-[#2a2a2a]">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">{stage}</p>
              <p className="text-2xl font-bold text-white">{funnel[stage]}</p>
              <div className="mt-2 h-1.5 bg-[#0a0a0a] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
                  style={{ width: `${(funnel[stage] / maxFunnel) * 100}%` }}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Requisitions */}
      <div className="space-y-3">
        {loading ? (
          <Card className="bg-[#141414] border-[#2a2a2a]">
            <CardContent className="p-8 text-center text-gray-500">Loading pipeline...</CardContent>
          </Card>
        ) : requisitions.length === 0 ? (
          <Card className="bg-[#141414] border-[#2a2a2a]">
            <CardContent className="p-8 text-center text-gray-500">No open requisitions</CardContent>
          </Card>
        ) : requisitions.map(req => (
          <Card key={req.id} className="bg-[#141414] border-[#2a2a2a]">
            <CardContent className="p-4">
              <button
                className="w-full text-left flex items-center justify-between"
                onClick={() => setExpandedReq(expandedReq === req.id ? null : req.id)}
              >
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-bold text-white">{req.title}</h3>
                  <Badge variant="outline" className="text-gray-500 border-[#2a2a2a] text-xs">{req.type}</Badge>
                  <span className="text-xs text-gray-500">{req.candidates.length} candidates</span>
                </div>
                <span className="text-gray-500 text-sm">{expandedReq === req.id ? '▲' : '▼'}</span>
              </button>

              {expandedReq === req.id && (
                <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
                  {req.candidates.length === 0 ? (
                    <p className="text-gray-500 text-sm">No candidates yet</p>
                  ) : (
                    req.candidates.map(c => (
                      <div key={c.id} className="flex items-center justify-between p-2 rounded-lg bg-[#0a0a0a] border border-[#1a1a1a]">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#2a2a2a] flex items-center justify-center text-xs font-bold text-white">
                            {c.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          <div>
                            <p className="text-sm text-white font-medium">{maskName(c.fullName, c.email)}</p>
                            {!anonymous && <p className="text-xs text-gray-500">{c.email}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {c.matchScore !== null && (
                            <div className="flex items-center gap-1">
                              <div className="w-12 h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${c.matchScore >= 70 ? 'bg-green-500' : c.matchScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                  style={{ width: `${c.matchScore}%` }} />
                              </div>
                              <span className="text-xs text-gray-400 font-mono">{Math.round(c.matchScore)}</span>
                            </div>
                          )}
                          <Badge className={STAGE_COLORS[c.stage] || ''}>{c.stage}</Badge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}