import { loadCultureContext } from '../_lib/load-culture'
import { CultureHeader } from '../_components/culture-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy } from 'lucide-react'

export default async function CultureAnniversariesPage() {
  const { anniversaries, thisYear } = await loadCultureContext()
  return (
    <div className="space-y-5">
      <CultureHeader subtitle="Tenure milestones — celebrate years with the team." />
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">Work Anniversaries</h2>
        {anniversaries.length === 0 ? (
          <p className="text-sm text-slate-500">No anniversaries this month or next.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {anniversaries.map((e) => (
              <div key={e.id} className="rounded-lg border border-slate-200 bg-white p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-300 to-slate-500 flex items-center justify-center text-white">
                  <Trophy className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{e.fullName}</p>
                  <p className="text-xs text-slate-500 truncate">{e.designation} · {e.department?.name ?? '—'}</p>
                </div>
                <Badge className="bg-slate-100 text-slate-900">
                  {e.years} year{e.years === 1 ? '' : 's'} · {new Date(thisYear, e.joinMonth, e.joinDay).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
