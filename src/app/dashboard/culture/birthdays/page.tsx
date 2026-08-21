import { loadCultureContext } from '../_lib/load-culture'
import { CultureHeader } from '../_components/culture-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Cake } from 'lucide-react'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export default async function CultureBirthdaysPage() {
  const { birthdays, allBirthdays, thisYear } = await loadCultureContext()

  // Group the full register by month, in calendar order.
  const byMonth = new Map<number, typeof allBirthdays>()
  for (const e of allBirthdays) {
    if (!byMonth.has(e.dobMonth)) byMonth.set(e.dobMonth, [])
    byMonth.get(e.dobMonth)!.push(e)
  }
  const thisMonth = new Date().getMonth()

  return (
    <div className="space-y-5">
      <CultureHeader subtitle="Everyone's birthday — with the ones coming up first." />

      {/* Coming up — this month and next. */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">
          Coming up
        </h2>
        {birthdays.length === 0 ? (
          <p className="text-sm text-slate-500">No birthdays this month or next.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {birthdays.map((e) => (
              <BirthdayCard key={e.id} e={e} thisYear={thisYear} highlight />
            ))}
          </div>
        )}
      </Card>

      {/* Everyone, by month. */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">
          All birthdays <span className="text-slate-400 font-normal">· {allBirthdays.length}</span>
        </h2>
        {allBirthdays.length === 0 ? (
          <p className="text-sm text-slate-500">No birthdays on record yet.</p>
        ) : (
          <div className="space-y-5">
            {MONTHS.map((name, m) => {
              const list = byMonth.get(m)
              if (!list || list.length === 0) return null
              return (
                <div key={m}>
                  <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${
                    m === thisMonth ? 'text-slate-900' : 'text-slate-400'
                  }`}>
                    {name}{m === thisMonth && ' · this month'}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {list.map((e) => <BirthdayCard key={e.id} e={e} thisYear={thisYear} />)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

function BirthdayCard({ e, thisYear, highlight }: {
  e: { id: string; fullName: string; designation: string | null; dobMonth: number; dobDay: number; department: { name: string } | null }
  thisYear: number
  highlight?: boolean
}) {
  return (
    <div className={`rounded-lg border p-3 flex items-center gap-3 ${
      highlight ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50/40'
    }`}>
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-300 to-slate-500 flex items-center justify-center text-white shrink-0">
        <Cake className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-900 truncate text-sm">{e.fullName}</p>
        <p className="text-[11px] text-slate-500 truncate">{e.designation} · {e.department?.name ?? '—'}</p>
      </div>
      <Badge variant="secondary">
        {new Date(thisYear, e.dobMonth, e.dobDay).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
      </Badge>
    </div>
  )
}
