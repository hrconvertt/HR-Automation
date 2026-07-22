'use client'
import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface InterviewWithCandidate {
  id: string
  round: number
  type: string
  scheduledAt: string
  duration: number
  meetingLink: string | null
  result: string | null
  candidate: { id: string; fullName: string; email: string }
  scorecards: { id: string; interviewerId: string; overallRating: number | null; submittedAt: string | null; recommendation: string | null; interviewer: { fullName: string } }[]
}

export default function SchedulingPage() {
  const [interviews, setInterviews] = useState<InterviewWithCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))

  useEffect(() => {
    async function fetchInterviews() {
      try {
        const res = await fetch('/api/recruiting/interviews')
        const data = await res.json()
        setInterviews(data)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    fetchInterviews()
  }, [])

  const upcoming = interviews
    .filter(i => new Date(i.scheduledAt) >= new Date() && !i.result)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())

  const pendingScorecards = interviews.filter(i => {
    const hasPending = i.scorecards.some(s => !s.submittedAt)
    return hasPending && new Date(i.scheduledAt) < new Date()
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Interview Scheduling</h1>
        <p className="text-sm text-gray-400 mt-1">Self-service scheduling, reminders, and feedback tracking</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-[#141414] border-[#2a2a2a]">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Upcoming Interviews</p>
            <p className="text-2xl font-bold text-white mt-1">{upcoming.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-[#141414] border-[#2a2a2a]">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Pending Scorecards</p>
            <p className="text-2xl font-bold text-yellow-400 mt-1">{pendingScorecards.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-[#141414] border-[#2a2a2a]">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Total Interviews</p>
            <p className="text-2xl font-bold text-white mt-1">{interviews.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Date filter */}
      <div className="flex items-center gap-3">
        <Input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          className="bg-[#141414] border-[#2a2a2a] text-white max-w-[200px]"
        />
      </div>

      {/* Upcoming */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Upcoming Interviews</h2>
        <div className="space-y-2">
          {upcoming.length === 0 ? (
            <Card className="bg-[#141414] border-[#2a2a2a]">
              <CardContent className="p-6 text-center text-gray-500">No upcoming interviews</CardContent>
            </Card>
          ) : upcoming.map(i => (
            <Card key={i.id} className="bg-[#141414] border-[#2a2a2a]">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-sm font-bold text-purple-400">
                      R{i.round}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{i.candidate.fullName}</p>
                      <p className="text-xs text-gray-500">{i.type} · {i.duration}min</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-white font-medium">
                      {new Date(i.scheduledAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(i.scheduledAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {i.meetingLink && (
                      <a href={i.meetingLink} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" className="bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30">
                          Join
                        </Button>
                      </a>
                    )}
                    <Button size="sm" className="bg-[#2a2a2a] text-gray-400 hover:bg-[#3a3a3a] hover:text-white">
                      Reschedule
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Pending Scorecards */}
      {pendingScorecards.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-yellow-400 mb-3">⚠ Pending Scorecards (SLA Overdue)</h2>
          <div className="space-y-2">
            {pendingScorecards.map(i => (
              <Card key={i.id} className="bg-yellow-500/5 border-yellow-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white">{i.candidate.fullName}</p>
                      <p className="text-xs text-gray-500">Round {i.round} · {i.type}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-yellow-400 font-semibold">
                        {i.scorecards.filter(s => !s.submittedAt).length} pending
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(i.scheduledAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}