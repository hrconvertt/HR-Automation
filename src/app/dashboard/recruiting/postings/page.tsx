'use client'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const PLATFORMS = ['ALL', 'LINKEDIN', 'INDEED', 'ZIPRECRUITER', 'CAREERS_PAGE', 'OTHER'] as const
const STATUSES = ['ALL', 'ACTIVE', 'PAUSED', 'EXPIRED', 'CLOSED'] as const

interface Posting {
  id: string
  platform: string
  trackingToken: string
  postedAt: string
  expiresAt: string | null
  cost: number | null
  status: string
  impressions: number
  clicks: number
  applications: number
  requisition: { title: string }
}

export default function PostingsPage() {
  const [postings, setPostings] = useState<Posting[]>([])
  const [loading, setLoading] = useState(true)
  const [platformFilter, setPlatformFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')

  useEffect(() => {
    async function fetchPostings() {
      try {
        const res = await fetch('/api/recruiting/requisitions')
        const reqs = await res.json()
        const allPostings: Posting[] = []
        for (const req of reqs) {
          const pRes = await fetch(`/api/recruiting/requisitions/${req.id}/postings`)
          const ps = await pRes.json()
          ps.forEach((p: Posting) => allPostings.push({ ...p, requisition: { title: req.title } }))
        }
        setPostings(allPostings)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    fetchPostings()
  }, [])

  const filtered = postings.filter(p => {
    if (platformFilter !== 'ALL' && p.platform !== platformFilter) return false
    if (statusFilter !== 'ALL' && p.status !== statusFilter) return false
    return true
  })

  const totalSpend = postings.reduce((sum, p) => sum + (p.cost || 0), 0)
  const totalApplications = postings.reduce((sum, p) => sum + p.applications, 0)
  const totalImpressions = postings.reduce((sum, p) => sum + p.impressions, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Job Postings & Distribution</h1>
        <p className="text-sm text-gray-400 mt-1">Track all job board postings, spend, and source attribution</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-[#141414] border-[#2a2a2a]">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Total Postings</p>
            <p className="text-2xl font-bold text-white mt-1">{postings.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-[#141414] border-[#2a2a2a]">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Total Spend</p>
            <p className="text-2xl font-bold text-white mt-1">${totalSpend.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="bg-[#141414] border-[#2a2a2a]">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Total Impressions</p>
            <p className="text-2xl font-bold text-white mt-1">{totalImpressions.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-[#141414] border-[#2a2a2a]">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Total Applications</p>
            <p className="text-2xl font-bold text-white mt-1">{totalApplications.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {PLATFORMS.map(p => (
          <Button key={p} variant={platformFilter === p ? 'default' : 'outline'} size="sm"
            onClick={() => setPlatformFilter(p)}
            className={platformFilter === p ? 'bg-white text-black hover:bg-gray-200' : 'bg-[#141414] text-gray-400 border-[#2a2a2a] hover:bg-[#1a1a1a] hover:text-white'}
          >
            {p === 'ALL' ? 'All Platforms' : p}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {STATUSES.map(s => (
          <Button key={s} variant={statusFilter === s ? 'default' : 'outline'} size="sm"
            onClick={() => setStatusFilter(s)}
            className={statusFilter === s ? 'bg-white text-black hover:bg-gray-200' : 'bg-[#141414] text-gray-400 border-[#2a2a2a] hover:bg-[#1a1a1a] hover:text-white'}
          >
            {s === 'ALL' ? 'All Statuses' : s}
          </Button>
        ))}
      </div>

      {/* Table */}
      <Card className="bg-[#141414] border-[#2a2a2a]">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#2a2a2a]">
                  <th className="text-left text-xs text-gray-500 font-semibold p-3 uppercase">Platform</th>
                  <th className="text-left text-xs text-gray-500 font-semibold p-3 uppercase">Job Title</th>
                  <th className="text-left text-xs text-gray-500 font-semibold p-3 uppercase">Token</th>
                  <th className="text-left text-xs text-gray-500 font-semibold p-3 uppercase">Posted</th>
                  <th className="text-right text-xs text-gray-500 font-semibold p-3 uppercase">Cost</th>
                  <th className="text-right text-xs text-gray-500 font-semibold p-3 uppercase">Impr.</th>
                  <th className="text-right text-xs text-gray-500 font-semibold p-3 uppercase">Clicks</th>
                  <th className="text-right text-xs text-gray-500 font-semibold p-3 uppercase">Apps</th>
                  <th className="text-center text-xs text-gray-500 font-semibold p-3 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="text-center text-gray-500 py-8">Loading...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={9} className="text-center text-gray-500 py-8">No postings found</td></tr>
                ) : filtered.map(p => (
                  <tr key={p.id} className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors">
                    <td className="p-3 text-sm text-white font-medium">{p.platform}</td>
                    <td className="p-3 text-sm text-gray-300">{p.requisition?.title || '-'}</td>
                    <td className="p-3 text-xs text-gray-500 font-mono">{p.trackingToken}</td>
                    <td className="p-3 text-xs text-gray-400">{new Date(p.postedAt).toLocaleDateString()}</td>
                    <td className="p-3 text-sm text-white text-right">${(p.cost || 0).toFixed(2)}</td>
                    <td className="p-3 text-sm text-gray-300 text-right">{p.impressions}</td>
                    <td className="p-3 text-sm text-gray-300 text-right">{p.clicks}</td>
                    <td className="p-3 text-sm text-white text-right font-semibold">{p.applications}</td>
                    <td className="p-3 text-center">
                      <Badge variant={p.status === 'ACTIVE' ? 'default' : 'secondary'}
                        className={p.status === 'ACTIVE' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                          p.status === 'PAUSED' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                          'bg-gray-500/20 text-gray-400 border-gray-500/30'}
                      >
                        {p.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}