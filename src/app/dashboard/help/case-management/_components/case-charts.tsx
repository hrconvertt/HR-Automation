'use client'

/**
 * Case Management charts, as Workday's dashboard draws them: open cases by
 * status and service team (stacked horizontal bars), by case type (columns)
 * and by category (horizontal bars). Status runs light to dark — New,
 * In progress, then On hold in blue — so the stacks read without the legend.
 */
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts'

const tick = { fontSize: 11, fill: '#475569' }

export function TeamStatusChart({ data }: { data: { team: string; New: number; 'In progress': number; 'On hold': number }[] }) {
  return (
    <div style={{ width: '100%', height: Math.max(180, data.length * 52 + 60) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
          <XAxis type="number" allowDecimals={false} tick={tick} />
          <YAxis type="category" dataKey="team" tick={tick} width={120} />
          <Tooltip cursor={{ fill: '#f1f5f9' }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="New" stackId="s" fill="#a7f3d0" />
          <Bar dataKey="In progress" stackId="s" fill="#059669" />
          <Bar dataKey="On hold" stackId="s" fill="#93c5fd" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function CountColumns({ data }: { data: { name: string; count: number }[] }) {
  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 40, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="name" tick={tick} interval={0} angle={-20} textAnchor="end" />
          <YAxis allowDecimals={false} tick={tick} />
          <Tooltip cursor={{ fill: '#f1f5f9' }} />
          <Bar dataKey="count" name="Count" fill="#10b981" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function CountBars({ data }: { data: { name: string; count: number }[] }) {
  return (
    <div style={{ width: '100%', height: Math.max(160, data.length * 48 + 40) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
          <XAxis type="number" allowDecimals={false} tick={tick} />
          <YAxis type="category" dataKey="name" tick={tick} width={120} />
          <Tooltip cursor={{ fill: '#f1f5f9' }} />
          <Bar dataKey="count" name="Count" fill="#10b981" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
