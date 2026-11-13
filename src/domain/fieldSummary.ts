import { addDays } from '@/api/mockApi'
import type { Field, Reading, Station } from '@/api/mockApi'

export type DailyLow = { date: string; lowTempC: number | null }

export type Trend = {
  direction: 'warming' | 'cooling' | 'steady' | 'insufficient'
  fromDate: string | null
  toDate: string | null
  deltaC: number | null
}

export type StationSummary = {
  station: Station
  dailyLows: DailyLow[]
  coldestLowC: number | null
  offline: boolean
  trend: Trend
}

export type FieldSummary = {
  field: Field
  stations: StationSummary[]
  dailyLows: DailyLow[]
  coldestLowC: number | null
  risk: 'at-risk' | 'no-frost-observed' | 'unknown'
  trend: Trend
}

function minimum(dailyLows: DailyLow[]): number | null {
  let low: number | null = null
  for (const { lowTempC } of dailyLows) {
    if (lowTempC !== null && (low === null || lowTempC < low)) low = lowTempC
  }
  return low
}

function recentTrend(dailyLows: DailyLow[]): Trend {
  let newer: DailyLow | undefined
  for (let i = dailyLows.length - 1; i >= 0; i--) {
    const older = dailyLows[i]
    if (older.lowTempC === null) continue
    if (newer && newer.lowTempC !== null) {
      const deltaC = newer.lowTempC - older.lowTempC
      return {
        direction: deltaC > 0 ? 'warming' : deltaC < 0 ? 'cooling' : 'steady',
        fromDate: older.date,
        toDate: newer.date,
        deltaC,
      }
    }
    newer = older
  }
  return { direction: 'insufficient', fromDate: null, toDate: null, deltaC: null }
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function compareStations(a: StationSummary, b: StationSummary): number {
  if (a.coldestLowC === null && b.coldestLowC !== null) return 1
  if (b.coldestLowC === null && a.coldestLowC !== null) return -1
  return (
    (a.coldestLowC !== null && b.coldestLowC !== null
      ? a.coldestLowC - b.coldestLowC
      : 0) ||
    compareText(a.station.label, b.station.label) ||
    compareText(a.station.id, b.station.id)
  )
}

export function summarizeFields(
  fields: Field[],
  stations: Station[],
  readings: Reading[],
  asOfDate: string,
): FieldSummary[] {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(asOfDate, i - 6))
  const windowDates = new Set(dates)
  const summariesById = new Map<string, FieldSummary>()
  for (const field of fields) {
    summariesById.set(field.id, {
      field,
      stations: [],
      dailyLows: dates.map((date) => ({ date, lowTempC: null })),
      coldestLowC: null,
      risk: 'unknown',
      trend: { direction: 'insufficient', fromDate: null, toDate: null, deltaC: null },
    })
  }

  const readingsByStation = new Map<string, Map<string, number | null>>()
  for (const station of stations) {
    if (summariesById.has(station.fieldId)) readingsByStation.set(station.id, new Map())
  }
  for (const reading of readings) {
    if (windowDates.has(reading.date)) {
      readingsByStation.get(reading.stationId)?.set(reading.date, reading.lowTempC)
    }
  }

  for (const station of stations) {
    const field = summariesById.get(station.fieldId)
    const stationReadings = readingsByStation.get(station.id)
    if (!field || !stationReadings) continue

    const dailyLows = dates.map((date) => ({
      date,
      lowTempC: stationReadings.get(date) ?? null,
    }))
    field.stations.push({
      station,
      dailyLows,
      coldestLowC: minimum(dailyLows),
      offline: dailyLows[5].lowTempC === null && dailyLows[6].lowTempC === null,
      trend: recentTrend(dailyLows),
    })
    for (let i = 0; i < dates.length; i++) {
      const low = dailyLows[i].lowTempC
      const fieldLow = field.dailyLows[i].lowTempC
      if (low !== null && (fieldLow === null || low < fieldLow)) {
        field.dailyLows[i].lowTempC = low
      }
    }
  }

  const summaries = Array.from(summariesById.values())
  for (const field of summaries) {
    field.coldestLowC = minimum(field.dailyLows)
    field.risk = field.coldestLowC === null
      ? 'unknown'
      : field.coldestLowC <= 0 ? 'at-risk' : 'no-frost-observed'
    field.trend = recentTrend(field.dailyLows)
    field.stations.sort(compareStations)
  }
  return summaries.sort((a, b) => (
    Number(b.risk === 'at-risk') - Number(a.risk === 'at-risk') ||
    compareText(a.field.name, b.field.name) ||
    compareText(a.field.id, b.field.id)
  ))
}
