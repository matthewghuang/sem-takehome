import { queryOptions } from '@tanstack/react-query'
import { addDays, AS_OF_DATE, getFields, getReadings, getStations } from '@/api/mockApi'
import type { Field, Reading, Station } from '@/api/mockApi'

export type Snapshot = {
  version: 1
  asOfDate: string
  fetchedAt: string
  fields: Field[]
  stations: Station[]
  readings: Reading[]
}

const snapshotStorageKey = `frost-indicator:field-snapshot:v1:${AS_OF_DATE}`

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const timestamp = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
}

function isSnapshot(value: unknown): value is Snapshot {
  if (
    typeof value !== 'object' || value === null || Array.isArray(value) ||
    !('version' in value) || value.version !== 1 ||
    !('asOfDate' in value) || value.asOfDate !== AS_OF_DATE ||
    !('fetchedAt' in value) || typeof value.fetchedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.fetchedAt)) ||
    !('fields' in value) || !Array.isArray(value.fields) ||
    !('stations' in value) || !Array.isArray(value.stations) ||
    !('readings' in value) || !Array.isArray(value.readings)
  ) return false

  const fieldIds = new Set<string>()
  for (const field of value.fields) {
    if (
      typeof field !== 'object' || field === null || Array.isArray(field) ||
      !isNonEmptyString(field.id) ||
      !isNonEmptyString(field.name) ||
      !isNonEmptyString(field.crop) ||
      fieldIds.has(field.id)
    ) return false
    fieldIds.add(field.id)
  }

  const stationIds = new Set<string>()
  for (const station of value.stations) {
    if (
      typeof station !== 'object' || station === null || Array.isArray(station) ||
      !isNonEmptyString(station.id) ||
      !isNonEmptyString(station.fieldId) ||
      !isNonEmptyString(station.label) ||
      !fieldIds.has(station.fieldId) ||
      stationIds.has(station.id)
    ) return false
    stationIds.add(station.id)
  }

  for (const reading of value.readings) {
    if (
      typeof reading !== 'object' || reading === null || Array.isArray(reading) ||
      !isNonEmptyString(reading.stationId) ||
      !stationIds.has(reading.stationId) ||
      !isCalendarDate(reading.date) ||
      (reading.lowTempC !== null && (
        typeof reading.lowTempC !== 'number' || !Number.isFinite(reading.lowTempC)
      ))
    ) return false
  }
  return true
}

export function readSavedSnapshot(): Snapshot | null {
  try {
    const saved = window.localStorage.getItem(snapshotStorageKey)
    if (saved === null) return null
    const snapshot: unknown = JSON.parse(saved)
    return isSnapshot(snapshot) ? snapshot : null
  } catch {
    // Storage is optional: blocked access and malformed JSON are cache misses.
    return null
  }
}

export function saveSnapshot(snapshot: Snapshot): void {
  try {
    if (isSnapshot(snapshot)) {
      window.localStorage.setItem(snapshotStorageKey, JSON.stringify(snapshot))
    }
  } catch {
    // Keep the successful in-memory result when serialization or storage fails.
  }
}

async function loadFieldSnapshot(): Promise<Snapshot> {
  const fields = await getFields()
  const stations = fields.length === 0
    ? []
    : await getStations(fields.map((field) => field.id))
  const readings = stations.length === 0
    ? []
    : await getReadings(
      stations.map((station) => station.id),
      addDays(AS_OF_DATE, -6),
      AS_OF_DATE,
    )

  // Only a complete pipeline becomes query data, including authoritative empty results.
  return {
    version: 1,
    asOfDate: AS_OF_DATE,
    fetchedAt: new Date().toISOString(),
    fields,
    stations,
    readings,
  }
}

export const fieldSnapshotQueryOptions = queryOptions({
  queryKey: ['field-snapshot', 1, AS_OF_DATE],
  queryFn: loadFieldSnapshot,
  retry: 3,
  retryDelay: (retryIndex) => (
    Math.min(1000 * 2 ** retryIndex, 4000) + Math.floor(Math.random() * 251)
  ),
  staleTime: 0,
  gcTime: Infinity,
  refetchOnMount: true,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  refetchInterval: false,
  networkMode: 'always',
})
