import { loadCultureContext } from '../_lib/load-culture'
import { CultureHeader } from '../_components/culture-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Cake } from 'lucide-react'

export default async function CultureBirthdaysPage() {
  const { birthdays, thisYear } = await loadCultureContext()
  return (
    <div className="space-y-5">
      <CultureHeader subtitle="Birthdays this month and next — wish someone well." />
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">Upcoming Birthdays</h2>
        {birthdays.length === 0 ? (
          <p className="text-sm text-slate-500">No birthdays this month or next.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {birthdays.map((e) => (
              <div key={e.id} className="rounded-lg border border-slate-200 bg-white p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-300 to-slate-500 flex items-center justify-center text-white">
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
    </div>
  )
}
