import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Calendar, Heart, Cake, Trophy } from 'lucide-react'
import { CultureClient } from './culture-client'

export default async function CulturePage() {
  const c = await cookies()
  const tok = c.get('hr_token')?.value
  const payload = tok ? verifyToken(tok) : null
  if (!payload) redirect('/login')

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true, fullName: true } } },
  })
  if (!me) redirect('/login')
  const previewRole = me.role === 'HR_ADMIN' ? c.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? me.role
  const isHR = effectiveRole === 'HR_ADMIN' && !previewRole

  const now = new Date()
  const thisYear = now.getFullYear()
  const thisMonth = now.getMonth()
  const nextMonth = (thisMonth + 1) % 12

  const [events, kudos, employees] = await Promise.all([
    prisma.companyEvent.findMany({ orderBy: { eventDate: 'desc' }, take: 50 }),
    prisma.kudos.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        from: { select: { id: true, fullName: true, employeeCode: true } },
        to: { select: { id: true, fullName: true, designation: true } },
      },
    }),
    prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, fullName: true, employeeCode: true, designation: true, dob: true, joiningDate: true, department: { select: { name: true } } },
      orderBy: { fullName: 'asc' },
    }),
  ])

  // Compute birthdays this + next month
  const birthdays = employees
    .filter((e) => e.dob)
    .map((e) => {
      const d = new Date(e.dob!)
      return { ...e, dobMonth: d.getMonth(), dobDay: d.getDate() }
    })
    .filter((e) => e.dobMonth === thisMonth || e.dobMonth === nextMonth)
    .sort((a, b) => {
      // Order: this month first by day, then next month
      const sa = a.dobMonth === thisMonth ? 0 : 1
      const sb = b.dobMonth === thisMonth ? 0 : 1
      if (sa !== sb) return sa - sb
      return a.dobDay - b.dobDay
    })

  // Anniversaries (yearly recurrence from joiningDate) for this + next month
  const anniversaries = employees
    .map((e) => {
      const d = new Date(e.joiningDate)
      const years = thisYear - d.getFullYear()
      return { ...e, joinMonth: d.getMonth(), joinDay: d.getDate(), years }
    })
    .filter((e) => (e.joinMonth === thisMonth || e.joinMonth === nextMonth) && e.years > 0)
    .sort((a, b) => {
      const sa = a.joinMonth === thisMonth ? 0 : 1
      const sb = b.joinMonth === thisMonth ? 0 : 1
      if (sa !== sb) return sa - sb
      return a.joinDay - b.joinDay
    })

  const upcomingEvents = events.filter((e) => e.eventDate >= now)
  const pastEvents = events.filter((e) => e.eventDate < now).slice(0, 20)

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-pink-500 via-rose-500 to-orange-500 p-6 text-white shadow-md">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-white/15 p-3 backdrop-blur">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">People &amp; Culture</h1>
            <p className="text-white/85 text-sm mt-1">Events, recognition, birthdays, and milestones at Convertt.</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="events">
        <TabsList className="bg-white border border-slate-200 rounded-lg p-1 inline-flex">
          <TabsTrigger value="events"><Calendar className="w-3.5 h-3.5 mr-1.5" />Events</TabsTrigger>
          <TabsTrigger value="recognition"><Heart className="w-3.5 h-3.5 mr-1.5" />Recognition</TabsTrigger>
          <TabsTrigger value="birthdays"><Cake className="w-3.5 h-3.5 mr-1.5" />Birthdays</TabsTrigger>
          <TabsTrigger value="anniversaries"><Trophy className="w-3.5 h-3.5 mr-1.5" />Anniversaries</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="mt-4">
          <CultureClient
            mode="events"
            isHR={isHR}
            upcomingEvents={upcomingEvents.map((e) => ({ ...e, eventDate: e.eventDate.toISOString() }))}
            pastEvents={pastEvents.map((e) => ({ ...e, eventDate: e.eventDate.toISOString() }))}
          />
        </TabsContent>

        <TabsContent value="recognition" className="mt-4">
          <CultureClient
            mode="recognition"
            myEmployeeId={me.employee?.id ?? null}
            colleagues={employees
              .filter((e) => e.id !== me.employee?.id)
              .map((e) => ({ id: e.id, fullName: e.fullName, designation: e.designation }))}
            kudos={kudos.map((k) => ({
              id: k.id,
              message: k.message,
              category: k.category,
              createdAt: k.createdAt.toISOString(),
              from: k.from,
              to: k.to,
            }))}
          />
        </TabsContent>

        <TabsContent value="birthdays" className="mt-4">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">Upcoming Birthdays</h2>
            {birthdays.length === 0 ? (
              <p className="text-sm text-slate-500">No birthdays this month or next.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {birthdays.map((e) => (
                  <div key={e.id} className="rounded-lg border border-slate-200 bg-white p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white">
                      <Cake className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{e.fullName}</p>
                      <p className="text-xs text-slate-500 truncate">{e.designation} · {e.department?.name ?? '—'}</p>
                    </div>
                    <Badge variant="secondary">
                      {new Date(thisYear, e.dobMonth, e.dobDay).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="anniversaries" className="mt-4">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">Work Anniversaries</h2>
            {anniversaries.length === 0 ? (
              <p className="text-sm text-slate-500">No anniversaries this month or next.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {anniversaries.map((e) => (
                  <div key={e.id} className="rounded-lg border border-slate-200 bg-white p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white">
                      <Trophy className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{e.fullName}</p>
                      <p className="text-xs text-slate-500 truncate">{e.designation} · {e.department?.name ?? '—'}</p>
                    </div>
                    <Badge className="bg-amber-100 text-amber-800">
                      {e.years} year{e.years === 1 ? '' : 's'} · {new Date(thisYear, e.joinMonth, e.joinDay).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
