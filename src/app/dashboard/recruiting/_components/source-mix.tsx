/**
 * Where candidates come from, and how far each channel gets them.
 *
 * This is the shape of Workday's Recruiting Diversity pair — a distribution
 * across sources, and the pipeline broken down by the same dimension — drawn
 * against the dimension this system actually records.
 *
 * It is not the ethnicity breakdown those charts show. Nothing in this schema
 * records ethnicity or race, on a candidate or on an employee, and the honest
 * options were to leave the charts empty or to add a race field and start
 * collecting it. The second is a policy decision with legal weight, not a
 * drawing job, so it is not made here. `Candidate.source` is real and already
 * populated, and "which channel produced the people who got hired" is the
 * question this data can answer.
 *
 * Horizontal bars, not a pie: these are magnitudes to compare, and the labels
 * are words rather than points on a scale.
 */
import { Card } from '@/components/ui/card'
import { SOURCE_ORDER, type SourceMixData } from '@/lib/queries/recruiting-analytics'

/** Categorical slots 1-6, in order — validated as a set on the light surface. */
const SOURCE_COLORS: Record<string, string> = {
  REFERRAL: '#2a78d6',
  LINKEDIN: '#eb6834',
  PORTAL: '#1baf7a',
  CAREERS_PAGE: '#eda100',
  WALK_IN: '#e87ba4',
  OTHER: '#008300',
}

const SOURCE_LABEL: Record<string, string> = {
  REFERRAL: 'Referral',
  LINKEDIN: 'LinkedIn',
  PORTAL: 'Job portal',
  CAREERS_PAGE: 'Careers page',
  WALK_IN: 'Walk-in',
  OTHER: 'Other',
}

export function SourceMix({ data }: { data: SourceMixData }) {
  const { bySource, byStage, total } = data
  const present = SOURCE_ORDER.filter((s) => bySource.some((b) => b.key === s && b.count > 0))
  const max = Math.max(1, ...bySource.map((b) => b.count))

  if (total === 0) {
    return (
      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">Candidate sources</h2>
        <p className="text-xs text-slate-400 mt-2">No candidates on record yet.</p>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {/* Distribution across channels. */}
      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">Candidate sources</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Every candidate on record, by the channel they came through. Sample: {total}.
        </p>

        <div className="mt-4 space-y-2.5">
          {present.map((key) => {
            const count = bySource.find((b) => b.key === key)?.count ?? 0
            const pct = (count / total) * 100
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="w-28 flex-shrink-0 text-xs text-slate-600 truncate">
                  {SOURCE_LABEL[key] ?? key}
                </span>
                <div className="flex-1 min-w-0 h-5 flex items-center">
                  <div
                    className="h-2.5 rounded-[4px]"
                    style={{ width: `${(count / max) * 100}%`, background: SOURCE_COLORS[key], minWidth: 4 }}
                    title={`${SOURCE_LABEL[key] ?? key}: ${count} of ${total}`}
                  />
                </div>
                <span
                  className="w-16 flex-shrink-0 text-right text-xs text-slate-700"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {count} <span className="text-slate-400">· {Math.round(pct)}%</span>
                </span>
              </div>
            )
          })}
        </div>
      </Card>

      {/* The same dimension, cut by how far people got. */}
      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">Pipeline by source</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Which channels produce candidates that get past the first read.
        </p>

        <div className="mt-4 space-y-2.5">
          {byStage.map((st) => (
            <div key={st.key} className="flex items-center gap-3">
              <span className="w-24 flex-shrink-0 text-xs text-slate-600 truncate">{st.label}</span>
              <div className="flex-1 min-w-0 h-5 flex items-center gap-[2px]">
                {st.total === 0 ? (
                  <span className="text-[11px] text-slate-300">—</span>
                ) : (
                  present.map((key) => {
                    const n = st.bySource[key] ?? 0
                    if (n === 0) return null
                    return (
                      <div
                        key={key}
                        className="h-2.5 rounded-[2px] first:rounded-l-[4px] last:rounded-r-[4px]"
                        style={{
                          width: `${(n / Math.max(1, ...byStage.map((b) => b.total))) * 100}%`,
                          background: SOURCE_COLORS[key],
                          minWidth: 4,
                        }}
                        title={`${st.label} · ${SOURCE_LABEL[key] ?? key}: ${n}`}
                      />
                    )
                  })
                )}
              </div>
              <span
                className="w-8 flex-shrink-0 text-right text-xs text-slate-700"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {st.total || '—'}
              </span>
            </div>
          ))}
        </div>

        {/* Six channels is past the point where a direct label fits on a
            segment, so identity lives in a legend rather than on the marks. */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4 pt-3 border-t border-slate-100">
          {present.map((key) => (
            <span key={key} className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: SOURCE_COLORS[key] }}
              />
              {SOURCE_LABEL[key] ?? key}
            </span>
          ))}
        </div>
      </Card>

      <p className="xl:col-span-2 text-[11px] text-slate-400">
        Workday splits these two charts by ethnicity. Nothing in this system records
        ethnicity — not on a candidate, not on an employee — so the split here is by
        source, which is recorded. Collecting a new attribute for diversity reporting
        is a decision about what Convertt asks people to disclose, and it has not been made.
      </p>
    </div>
  )
}
