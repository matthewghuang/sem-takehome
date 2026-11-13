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
