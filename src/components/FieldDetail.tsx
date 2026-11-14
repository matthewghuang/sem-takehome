import { addDays, AS_OF_DATE } from '@/api/mockApi'
import { RecentTrend } from '@/components/RecentTrend'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { FieldSummary } from '@/domain/fieldSummary'
import { formatDate } from '@/lib/formatDate'

const previousDate = addDays(AS_OF_DATE, -1)

export function FieldDetail({ field }: { field: FieldSummary }) {
  const hasMissingReadings = field.stations.some(({ dailyLows }) => (
    dailyLows.some(({ lowTempC }) => lowTempC === null)
  ))

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h2 id="field-detail-heading" className="text-xl font-semibold break-words">{field.field.name}</h2>
        <p className="text-sm text-muted-foreground">{field.field.crop}</p>
      </div>
      <div role="group" aria-labelledby="field-trend-heading" className="space-y-2 text-sm">
        <p id="field-trend-heading" className="font-medium">Recent change in coldest daily low</p>
        <RecentTrend trend={field.trend} />
        <p className="text-muted-foreground">
          Compares the latest two available daily minima. Reporting stations may differ between days.
          This is an observed change, not a forecast.
        </p>
      </div>
      {hasMissingReadings && (
        <p role="note" className="rounded-lg border bg-muted p-3 text-sm">
          Some daily readings are missing. Frost risk and trends use available readings only.
        </p>
      )}
      <div className="space-y-2 text-sm">
        <p className="font-medium">Coldest stations first — last 7 days</p>
        <p className="text-muted-foreground">
          Offline means no report on {formatDate(AS_OF_DATE)} or {formatDate(previousDate)}.
          Zero is a valid report.
        </p>
      </div>
      {field.stations.length === 0 ? (
        <p className="text-sm">No stations available for this field.</p>
      ) : (
        <ul aria-label="Stations, coldest first" className="grid gap-4 lg:grid-cols-2">
          {field.stations.map((summary) => (
            <li key={summary.station.id} className="min-w-0">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle><h3 className="break-words">{summary.station.label}</h3></CardTitle>
                  <Badge variant={summary.offline ? 'outline' : 'secondary'}>
                    {summary.offline ? 'Offline' : 'Reporting'}
                  </Badge>
                  <CardDescription>
                    7-day minimum: {summary.coldestLowC === null ? 'No readings' : `${summary.coldestLowC}°C`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">Recent change in daily low</p>
                    <RecentTrend trend={summary.trend} />
                  </div>
                  <dl className="space-y-2 text-sm">
                    {summary.dailyLows.map(({ date, lowTempC }) => (
                      <div key={date} className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                        <dt><time dateTime={date}>{formatDate(date)}</time></dt>
                        <dd className="tabular-nums">{lowTempC === null ? 'No reading' : `${lowTempC}°C`}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
