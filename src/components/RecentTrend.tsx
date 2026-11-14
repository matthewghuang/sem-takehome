import type { Trend } from '@/domain/fieldSummary'
import { formatDate } from '@/lib/formatDate'

const directions = {
  warming: { arrow: '↑', label: 'Warming', color: 'text-orange-700 dark:text-orange-400' },
  cooling: { arrow: '↓', label: 'Cooling', color: 'text-blue-700 dark:text-blue-400' },
  steady: { arrow: '→', label: 'Steady', color: 'text-muted-foreground' },
}

export function RecentTrend({ trend }: { trend: Trend }) {
  if (
    trend.direction === 'insufficient' || trend.deltaC === null ||
    trend.fromDate === null || trend.toDate === null
  ) return <span>Insufficient readings</span>

  const { arrow, label, color } = directions[trend.direction]
  return (
    <div className="space-y-1">
      <span className="font-medium">
        <span aria-hidden="true" className={color}>{arrow} </span>
        {label} {trend.deltaC > 0 ? '+' : ''}{trend.deltaC}°C
      </span>
      <span className="block text-xs text-muted-foreground">
        <time dateTime={trend.fromDate}>{formatDate(trend.fromDate)}</time>
        {' to '}
        <time dateTime={trend.toDate}>{formatDate(trend.toDate)}</time>
      </span>
    </div>
  )
}
