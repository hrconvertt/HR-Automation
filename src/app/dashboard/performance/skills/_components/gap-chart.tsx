'use client'

/**
 * Skill gaps — job profiles v workers in job. One group of bars per
 * department, one bar per match band, as Workday draws its Team Skills
 * Snapshot. The bands run from grey (negligible) to green (strong) so the
 * order reads without the legend.
 */
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts'
import { MATCH_BUCKETS } from '@/lib/talent-labels'

export function GapChart({ data }: { data: Array<{ dept: string } & Record<string, number | string>> }) {
  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="dept" tick={{ fontSize: 11, fill: '#475569' }} interval={0} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
          <Tooltip cursor={{ fill: '#f1f5f9' }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {MATCH_BUCKETS.map((b) => (
            <Bar key={b.key} dataKey={b.key} name={b.label} fill={b.color} radius={[3, 3, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
