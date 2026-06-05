import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  change?: string
  changeType?: 'positive' | 'negative' | 'neutral'
  iconColor?: string
  iconBg?: string
}

export function StatCard({
  label,
  value,
  icon: Icon,
  change,
  changeType = 'neutral',
  iconColor = 'text-blue-600',
  iconBg = 'bg-blue-50',
}: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {change && (
            <p
              className={cn(
                'text-xs mt-1 font-medium',
                changeType === 'positive' && 'text-green-600',
                changeType === 'negative' && 'text-red-500',
                changeType === 'neutral' && 'text-gray-500'
              )}
            >
              {change}
            </p>
          )}
        </div>
        <div className={cn('p-2.5 rounded-lg', iconBg)}>
          <Icon className={cn('w-5 h-5', iconColor)} />
        </div>
      </div>
    </div>
  )
}
